import {
  Image,
  StyleSheet,
  Platform,
  NativeModules,
  Button,
  View,
  Switch,
  NativeEventEmitter,
  ScrollView, TouchableOpacity
} from 'react-native';
import React, {useCallback, useEffect, useState} from "react";
import {useFocusEffect} from "expo-router";
import { addEventListener } from "@react-native-community/netinfo";
import {useAppDispatch, useAppSelector} from "@/app/store";
import {refreshIsRunning} from "@/app/store/server";
import Clipboard from '@react-native-clipboard/clipboard';
import Toast from "react-native-root-toast";
import Text from '@/components/ColorSchemeText'
import ColorSchemeCard from "@/components/ColorSchemeCard";
import axios from "axios/index";
import RNFS from "react-native-fs";

const {Alist, NotificationManager} = NativeModules;
const DEFAULT_PASSWORD = 'admin'

export default function HomeScreen() {
  const isRunning = useAppSelector(state => state.server.isRunning)
  const autoRun = useAppSelector(state => state.setting.autoRun)
  const iCloudSync = useAppSelector(state => state.setting.iCloudSync)
  const dispatch = useAppDispatch()
  const [adminPwd, setAdminPwd] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [ip, setIP] = useState(null)
  const [loading, setLoading] = useState(false)
  const start = async () => {
    if (isRunning) return
    setLoading(true)
    try {
      await Alist.start();
      // 服务启动需要时间，这里做一个延时检测
      await new Promise(resolve => setTimeout(resolve, 500))
      await axios.get('http://127.0.0.1:5244/ping', {
        timeout: 1000
      })
      await dispatch(refreshIsRunning())
    } catch (e) {
      console.error(e);
    }
    setLoading(false)
  };

  const stop = async () => {
    if (!isRunning) return
    try {
      await Alist.stop()
      dispatch(refreshIsRunning())
    } catch (e) {
      console.error(e);
    }
  };
  const updateAdminInfo = useCallback(async () => {
    const pwd = await Alist.getAdminPassword()
    const username = await Alist.getAdminUsername()
    if (!pwd) {
      // 只有首次启动服务会获取不到密码，那么直接设置初始密码为admin
      await changePassword(DEFAULT_PASSWORD)
      setAdminPwd(DEFAULT_PASSWORD)
    } else {
      setAdminPwd(pwd)
    }
    setAdminUsername(username)
  }, [setAdminPwd, setAdminUsername])

  const toggleSwitch = useCallback(() => {
    if (isRunning) {
      stop()
    } else {
      start()
    }
  }, [isRunning, stop, start])

  const changePassword = useCallback((pwd: string) => {
    return Alist.setAdminPassword(pwd)
  }, [])

  const copy = useCallback((ip: string) => {
    Clipboard.setString(ip);
    Toast.show('已复制到剪切板', {
      position: Toast.positions.CENTER
    })
  }, [])

  const ensureConfigDirectory = useCallback(async () => {
    /*
    背景：
    1. ios覆盖安装应用时，会创建一个新的Document目录，同时会把旧文件拷贝过去
    2. config文件中存储的日志文件、临时目录等路径都是绝对路径

    问题：由于Document目录已更新，但是config文件中存储的文件路径没有更新，服务启动后仍向旧的Document目录读写文件，会导致读写无权限

    解法：这里对config文件中存储的文件路径进行处理，替换为新的Document目录
     */
    try {
      const configPath = RNFS.DocumentDirectoryPath + '/config.json'
      if (!await RNFS.exists(configPath)) return
      const configData = await RNFS.readFile(configPath)
      if (configData.includes(RNFS.DocumentDirectoryPath)) return
      let patternString = RNFS.DocumentDirectoryPath.replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\//, '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/')
      const regexPattern = new RegExp(patternString, 'g');
      const newConfigData = configData.replace(regexPattern, RNFS.DocumentDirectoryPath)
      await RNFS.writeFile(RNFS.DocumentDirectoryPath + `/config.json`, newConfigData)
      console.log('已更新配置文件')
    } catch (e) {
      console.error(e)
    }
  }, [])

  const init = useCallback( async () => {
    try {
      await ensureConfigDirectory()
      await Alist.init()
      try {
        // iCloud同步 失败不阻塞主功能
        if (iCloudSync) {
          await Alist.iCloudRestore()
        }
      } catch (e) {
        console.error(e)
      }
      if (autoRun) {
        const isRunning = await Alist.isRunning()
        if (!isRunning) {
          // 自动启动
          start()
          NotificationManager.scheduleNotification("AListServer", "服务正在运行中")
        }
      }
    } catch (e: any) {
      console.error(e)
      Toast.show(e?.message ?? "AList初始化失败", {
        position: Toast.positions.CENTER
      })
    }
  }, [autoRun, ensureConfigDirectory, start, iCloudSync])

  useFocusEffect(React.useCallback(() => {
    if (isRunning) {
      updateAdminInfo()
    }
  }, [isRunning, updateAdminInfo]));

  useEffect(() => {
    return addEventListener(state => {
      // @ts-ignore
      setIP(state.details?.ipAddress)
    });
  }, []);

  useEffect(() => {
    init()
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView style={{flex: 1, paddingHorizontal: 16,}} showsVerticalScrollIndicator={false}>
        <ColorSchemeCard>
          <View style={styles.cardItem}>
            <Text>服务状态：{loading ? '启动中...' : isRunning ? '运行中' : '未运行'}</Text>
            <Switch
              trackColor={{false: '#767577', true: '#81b0ff'}}
              thumbColor={isRunning ? '#f5dd4b' : '#f4f3f4'}
              ios_backgroundColor="#3e3e3e"
              onValueChange={toggleSwitch}
              value={isRunning || loading}
            />
          </View>
        </ColorSchemeCard>
        <ColorSchemeCard style={styles.cardMarginTop}>
          <View style={styles.cardItem}>
            <Text style={styles.bold}>账号信息</Text>
          </View>
          <View style={[styles.cardItem]}>
            <Text>用户名</Text>
            <Text>{isRunning ? adminUsername : '请先启动服务'}</Text>
          </View>
          <View style={[styles.cardItem]}>
            <Text>密码</Text>
            <Text>{isRunning ? adminPwd : '请先启动服务'}</Text>
          </View>
        </ColorSchemeCard>
        <ColorSchemeCard style={styles.cardMarginTop}>
          <View style={styles.cardItem}>
            <Text style={styles.bold}>WebDAV信息</Text>
          </View>
          <View style={[styles.cardItem, ip ? styles.multiRow : null]}>
            <Text>服务器地址</Text>
            <View style={{justifyContent: 'center', alignItems: 'flex-end'}}>
              {ip ? (
                <TouchableOpacity onPress={() => copy(ip)}>
                  <Text style={{textAlign: 'right', marginBottom: 8}}>{ip}（局域网访问）</Text>
                </TouchableOpacity>
              ) : null }
              <TouchableOpacity onPress={() => copy('127.0.0.1')}>
                <Text style={{textAlign: 'right'}}>127.0.0.1（限本机访问）</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.cardItem]}>
            <Text>端口</Text>
            <TouchableOpacity onPress={() => copy('5244')}>
              <Text>5244</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.cardItem]}>
            <Text>路径</Text>
            <TouchableOpacity onPress={() => copy('dav')}>
              <Text>dav</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.cardItem]}>
            <Text>用户名/密码</Text>
            <Text>同“账号信息”</Text>
          </View>
        </ColorSchemeCard>
        <Text style={styles.runningTip}>请保持App前台运行，否则服务可能不可用</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  container: {
    paddingTop: 16,
    paddingBottom: 32,
    flex: 1,
  },
  cardItem: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 50,
  },
  multiRow: {
    minHeight: 50,
    alignItems: 'flex-start',
  },
  cardItemBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgb(228, 228, 228)',
  },
  cardMarginTop: {
    marginTop: 40,
  },
  bold: {
    fontWeight: 'bold',
  },
  runningTip: {
    color: 'gray',
    textAlign: 'center',
    marginTop: 36,
  }
});