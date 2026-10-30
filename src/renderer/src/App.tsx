import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  App as AntdApp,
  Button,
  Layout,
  Menu,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import {
  AppstoreOutlined,
  BugOutlined,
  CameraOutlined,
  CodeOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UsbOutlined
} from '@ant-design/icons'
import { deviceStateLabel } from '@shared/parsers'
import CapturePage from './pages/CapturePage'
import DevicePage from './pages/DevicePage'
import LogCenterPage from './pages/LogCenterPage'
import AppsPage from './pages/AppsPage'
import FilesPage from './pages/FilesPage'
import TerminalPage from './pages/TerminalPage'
import QuickCommandsPage from './pages/QuickCommandsPage'
import SettingsModal from './components/SettingsModal'
import adbIcon from './assets/adb-icon.png'
import { useAppStore } from './store/app-store'

interface PageMeta {
  title: string
  description: string
  items: string[]
}

const pages: Record<'log' | 'commands' | 'apps' | 'files' | 'capture' | 'terminal', PageMeta> = {
  log: {
    title: '日志中心',
    description: '实时抓取 logcat，按级别、Tag、包名/PID 过滤，支持保存、历史日志和崩溃日志。',
    items: [
      '实时日志与暂停/继续',
      '级别、Tag、关键字、包名/PID 过滤',
      '保存到本地、加载历史日志',
      '崩溃日志与指定应用日志'
    ]
  },
  commands: {
    title: '测试工具',
    description: 'Monkey、设备诊断与界面操作；已有功能不重复。',
    items: [
      'Monkey 一键测试',
      '当前界面、电池、内存、CPU、帧率、温度',
      '点击、滑动、按键、文本输入'
    ]
  },
  apps: {
    title: '应用管理',
    description: '列出用户应用和系统应用，查看版本、安装路径、Activity、权限并执行安装/卸载。',
    items: [
      '应用列表与搜索',
      '版本、路径、Activity、权限',
      '启动、停止、清数据',
      '安装、卸载'
    ]
  },
  files: {
    title: '文件管理',
    description: '浏览手机文件目录，上传、下载、删除、新建、重命名，并显示传输进度。',
    items: [
      '目录浏览与搜索',
      '上传、下载与进度',
      '删除、新建目录、重命名',
      '文件大小与修改时间'
    ]
  },
  capture: {
    title: '截图录屏',
    description: '一键截图并拉取到电脑，开始/停止录屏并保存到自定义目录。',
    items: ['一键截图并自动拉取', '开始/停止录屏', '保存目录设置', '录屏 180 秒上限处理']
  },
  terminal: {
    title: '终端',
    description: '执行任意 ADB Shell 命令，显示标准输出和错误输出，带历史和危险命令确认。',
    items: ['命令输入与输出', '命令历史', '清空终端', '危险命令二次确认']
  }
}

type PageKey = 'device' | keyof typeof pages

const menuItems = [
  { key: 'device', icon: <UsbOutlined />, label: '设备与设置' },
  {
    key: 'log',
    icon: <BugOutlined />,
    label: (
      <span>日志中心</span>
    )
  },
  {
    key: 'commands',
    icon: <ThunderboltOutlined />,
    label: (
      <span>测试工具</span>
    )
  },
  {
    key: 'apps',
    icon: <AppstoreOutlined />,
    label: (
      <span>应用管理</span>
    )
  },
  {
    key: 'files',
    icon: <FolderOpenOutlined />,
    label: (
      <span>文件管理</span>
    )
  },
  {
    key: 'capture',
    icon: <CameraOutlined />,
    label: (
      <span>截图录屏</span>
    )
  },
  {
    key: 'terminal',
    icon: <CodeOutlined />,
    label: (
      <span>终端</span>
    )
  }
]

function stateColor(state: string): string {
  if (state === 'device') return 'success'
  if (state === 'unauthorized') return 'warning'
  if (state === 'offline' || state.startsWith('no permissions')) return 'error'
  return 'default'
}

export default function App(): ReactElement {
  const { message } = AntdApp.useApp()
  const {
    state,
    appInfo,
    initializing,
    initialize,
    setState,
    selectDevice,
    refreshDevices,
    openSettings
  } = useAppStore()
  const [pageKey, setPageKey] = useState<PageKey>('device')
  const [refreshing, setRefreshing] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void initialize()
      .then(() => {
        if (active) setInitError(null)
      })
      .catch((error: unknown) => {
        if (active) {
          setInitError(String(error))
          message.error('初始化失败：' + String(error))
        }
      })
    const unsubscribe = window.api.onStateChanged((nextState) => {
      if (active) setState(nextState)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [initialize, message, setState])

  const selectedDevice = state?.devices.find(
    (device) => device.serial === state.selectedSerial
  )
  const adb = state?.adb
  const serverStopped = adb?.health === 'ready' && !adb.serverRunning
  const adbTag =
    adb?.health === 'ready' ? (
      adb.serverRunning ? (
        <Tag color="success">ADB {adb.version ? 'v' + adb.version : '就绪'}</Tag>
      ) : (
        <Tag color="warning">ADB 已停止</Tag>
      )
    ) : adb?.health === 'checking' ? (
      <Tag color="processing">检测 ADB</Tag>
    ) : adb?.health === 'not-configured' ? (
      <Tag color="warning">未配置 ADB</Tag>
    ) : (
      <Tag color="error">ADB 异常</Tag>
    )

  const handleRefresh = async (): Promise<void> => {
    if (serverStopped) {
      message.info('ADB Server 已停止，请先点“启动 Server”')
      return
    }
    setRefreshing(true)
    try {
      await refreshDevices()
    } catch (error) {
      message.error('刷新失败：' + String(error))
    } finally {
      setRefreshing(false)
    }
  }

  if (initializing) {
    return (
      <div className="loading-screen">
        <Spin size="large" />
        <Typography.Text type="secondary">正在加载 ADB 工具箱...</Typography.Text>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="loading-screen">
        <Typography.Text type="danger">
          {initError ? '初始化失败：' + initError : '无法读取运行状态'}
        </Typography.Text>
        <Button onClick={() => window.location.reload()}>重新加载</Button>
      </div>
    )
  }

  let content: ReactNode
  if (pageKey === 'device') {
    content = <DevicePage />
  } else if (pageKey === 'log') {
    content = <LogCenterPage />
  } else if (pageKey === 'capture') {
    content = <CapturePage />
  } else if (pageKey === 'commands') {
    content = <QuickCommandsPage />
  } else if (pageKey === 'apps') {
    content = <AppsPage />
  } else if (pageKey === 'files') {
    content = <FilesPage />
  } else {
    content = <TerminalPage />
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <div className="brand">
          <img className="brand-logo" src={adbIcon} alt="" />
          <Typography.Text strong className="brand-title">
            ADB 工具箱
          </Typography.Text>
        </div>

        <Select
          className="device-select"
          placeholder="选择测试设备"
          value={state.selectedSerial ?? undefined}
          onChange={(value: string) => {
            void selectDevice(value)
          }}
          options={state.devices.map((device) => ({
            value: device.serial,
            label: (device.model || device.serial) + ' · ' + deviceStateLabel(device.state)
          }))}
          notFoundContent="没有检测到设备"
          showSearch
          optionFilterProp="label"
        />
        {selectedDevice ? (
          <Tag color={stateColor(selectedDevice.state)}>
            {deviceStateLabel(selectedDevice.state)}
          </Tag>
        ) : (
          <Tag>无设备</Tag>
        )}
        {adbTag}

        <Tooltip title={state.foregroundApp?.activity ?? '当前前台应用'}>
          <Typography.Text className="header-meta" type="secondary" ellipsis>
            {state.foregroundApp ? state.foregroundApp.packageName : '前台应用 —'}
          </Typography.Text>
        </Tooltip>

        <div className="header-spacer" />

        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={refreshing}
            disabled={Boolean(serverStopped)}
            title={serverStopped ? 'ADB Server 已停止，请先启动' : undefined}
            onClick={() => void handleRefresh()}
          >
            刷新
          </Button>
          <Button icon={<SettingOutlined />} onClick={openSettings}>
            设置
          </Button>
        </Space>
      </Layout.Header>

      <Layout className="app-body">
        <Layout.Sider width={208} className="app-sider" theme="dark">
          <Menu
            mode="inline"
            theme="dark"
            selectedKeys={[pageKey]}
            items={menuItems}
            onClick={({ key }) => setPageKey(key as PageKey)}
          />
        </Layout.Sider>
        <Layout.Content className="app-content">{content}</Layout.Content>
      </Layout>

      <Layout.Footer className="app-footer">
        <span>最近更新：{new Date(state.lastUpdated).toLocaleTimeString('zh-CN', { hour12: false })}</span>
        <span className="footer-path" title={appInfo?.configPath}>
          配置：{appInfo?.configPath ?? '—'}
        </span>
        <span className="footer-spacer" />
      </Layout.Footer>

      <SettingsModal />
    </Layout>
  )
}