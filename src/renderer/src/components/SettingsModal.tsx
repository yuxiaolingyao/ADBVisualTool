import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd'
import { FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons'
import type { HealthCheckResult } from '@shared/types'
import { useAppStore } from '../store/app-store'

interface SaveDirs {
  log: string
  screenshot: string
  record: string
  monkey: string
}

export default function SettingsModal(): ReactElement {
  const { message } = AntdApp.useApp()
  const {
    config,
    appInfo,
    state,
    settingsOpen,
    closeSettings,
    detectAdb,
    setAdbPath,
    updateConfig,
    setState
  } = useAppStore()
  const [adbPath, setLocalAdbPath] = useState('')
  const [autoDetect, setAutoDetect] = useState(true)
  const [directions, setDirections] = useState<SaveDirs>({
    log: '',
    screenshot: '',
    record: '',
    monkey: ''
  })
  const [detecting, setDetecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [health, setHealth] = useState<HealthCheckResult | null>(null)

  useEffect(() => {
    if (!settingsOpen) return
    setLocalAdbPath(config?.adbPath ?? '')
    setAutoDetect(config?.autoDetectAdb ?? true)
    setDirections({
      log: config?.log.saveDir ?? '',
      screenshot: config?.capture.screenshotDir ?? '',
      record: config?.capture.recordDir ?? '',
      monkey: config?.monkey.outputDir ?? ''
    })
    setHealth(null)
  }, [settingsOpen, config])

  const handleDetect = async (): Promise<void> => {
    setDetecting(true)
    try {
      const detected = await detectAdb()
      if (detected.bestPath) {
        setLocalAdbPath(detected.bestPath)
        message.success('已找到 ADB：' + (detected.bestVersion ?? detected.bestPath))
      } else {
        message.warning(detected.error ?? '没有找到可用的 adb.exe')
      }
    } catch (error) {
      message.error('检测失败：' + String(error))
    } finally {
      setDetecting(false)
    }
  }

  const handlePickAdb = async (): Promise<void> => {
    const selected = await window.api.pickAdbFile()
    if (selected) setLocalAdbPath(selected)
  }

  const handlePickDirectory = async (key: keyof SaveDirs): Promise<void> => {
    const selected = await window.api.pickDirectory()
    if (selected) setDirections((previous) => ({ ...previous, [key]: selected }))
  }

  const handleTest = async (): Promise<void> => {
    if (!adbPath.trim()) {
      message.warning('请先选择 adb.exe')
      return
    }
    setTesting(true)
    try {
      const result = await window.api.validateAdb(adbPath.trim())
      if (result.ok) {
        message.success('ADB 可用，版本：' + (result.version ?? '未知'))
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error('测试失败：' + String(error))
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (Object.values(directions).some((value) => !value.trim())) {
      message.warning('四个保存目录都不能为空')
      return
    }
    setSaving(true)
    try {
      await setAdbPath(adbPath.trim() || null)
      const nextState = await window.api.getState()
      setState(nextState)
      if (adbPath.trim() && nextState.adb.health !== 'ready') {
        message.error(nextState.adb.message ?? 'ADB 不可用，请检查路径')
        return
      }
      await updateConfig({
        autoDetectAdb: autoDetect,
        log: { saveDir: directions.log.trim() },
        capture: {
          screenshotDir: directions.screenshot.trim(),
          recordDir: directions.record.trim()
        },
        monkey: { outputDir: directions.monkey.trim() }
      })
      message.success('设置已保存')
      closeSettings()
    } catch (error) {
      message.error('保存失败：' + String(error))
    } finally {
      setSaving(false)
    }
  }

  const handleOpenConfigFolder = async (): Promise<void> => {
    if (!appInfo) return
    const result = await window.api.openPath(appInfo.userDataPath)
    if (!result.ok) message.error(result.message)
  }

  const handleHealthCheck = async (): Promise<void> => {
    setChecking(true)
    try {
      const result = await window.api.healthCheck()
      setHealth(result)
      if (result.ok) message.success('整体检查通过')
      else message.warning('整体检查发现未通过项')
    } catch (error) {
      message.error('检查失败：' + String(error))
    } finally {
      setChecking(false)
    }
  }

  return (
    <Modal
      title="设置与验收检查"
      open={settingsOpen}
      onCancel={closeSettings}
      onOk={() => void handleSave()}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={760}
      destroyOnClose
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
    >
      <Form layout="vertical">
        <Typography.Title level={5}>ADB</Typography.Title>
        <Form.Item label="ADB 路径">
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={adbPath}
              onChange={(event) => setLocalAdbPath(event.target.value)}
              placeholder="选择 platform-tools/adb.exe"
              allowClear
            />
            <Button onClick={() => void handlePickAdb()}>选择文件</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={detecting}
              onClick={() => void handleDetect()}
            >
              自动检测
            </Button>
            <Button loading={testing} onClick={() => void handleTest()}>
              测试 ADB
            </Button>
            <Button type="link" onClick={() => void handleOpenConfigFolder()}>
              <FolderOpenOutlined /> 打开配置目录
            </Button>
          </Space>
        </Form.Item>

        <Form.Item label="启动时自动检测 ADB">
          <Switch checked={autoDetect} onChange={setAutoDetect} />
          <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
            找不到已保存的 adb 时，自动扫描常见 SDK 路径
          </Typography.Text>
        </Form.Item>

        <Divider />
        <Typography.Title level={5}>保存目录</Typography.Title>
        <Form.Item label="日志保存目录">
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={directions.log}
              onChange={(event) =>
                setDirections((previous) => ({ ...previous, log: event.target.value }))
              }
            />
            <Button onClick={() => void handlePickDirectory('log')}>选择目录</Button>
          </Space.Compact>
        </Form.Item>
        <Form.Item label="截图保存目录">
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={directions.screenshot}
              onChange={(event) =>
                setDirections((previous) => ({ ...previous, screenshot: event.target.value }))
              }
            />
            <Button onClick={() => void handlePickDirectory('screenshot')}>选择目录</Button>
          </Space.Compact>
        </Form.Item>
        <Form.Item label="录屏保存目录">
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={directions.record}
              onChange={(event) =>
                setDirections((previous) => ({ ...previous, record: event.target.value }))
              }
            />
            <Button onClick={() => void handlePickDirectory('record')}>选择目录</Button>
          </Space.Compact>
        </Form.Item>
        <Form.Item label="Monkey 报告目录">
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={directions.monkey}
              onChange={(event) =>
                setDirections((previous) => ({ ...previous, monkey: event.target.value }))
              }
            />
            <Button onClick={() => void handlePickDirectory('monkey')}>选择目录</Button>
          </Space.Compact>
        </Form.Item>

        <Divider />
        <Typography.Title level={5}>启动方式</Typography.Title>
        <Alert
          type="info"
          showIcon
          message="通过程序入口或 pnpm dev 启动；关闭窗口会隐藏到右下角托盘，托盘右键可显示或退出。"
        />

        <Divider />
        <Typography.Title level={5}>版本信息</Typography.Title>
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="应用版本">{appInfo?.version ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="平台">{appInfo?.platform ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Electron">{appInfo?.electronVersion ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Chrome">{appInfo?.chromeVersion ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Node">{appInfo?.nodeVersion ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="ADB">
            {state?.adb.version ? 'v' + state.adb.version : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="配置路径" span={2}>
            <Typography.Text className="mono">{appInfo?.configPath ?? '—'}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>

        <Divider />
        <Typography.Title level={5}>整体检查</Typography.Title>
        <Space style={{ marginBottom: 10 }}>
          <Button type="primary" ghost loading={checking} onClick={() => void handleHealthCheck()}>
            开始检查
          </Button>
          {health ? (
            <Typography.Text type="secondary">检查时间：{health.checkedAt}</Typography.Text>
          ) : null}
        </Space>
        {health ? (
          <div>
            <Alert
              style={{ marginBottom: 10 }}
              type={health.ok ? 'success' : 'warning'}
              showIcon
              message={health.ok ? '全部通过' : '存在未通过项'}
            />
            <Space direction="vertical" style={{ width: '100%' }}>
              {health.items.map((item) => (
                <div key={item.key}>
                  <Tag color={item.ok ? 'success' : 'error'}>{item.ok ? '通过' : '失败'}</Tag>
                  <Typography.Text strong>{item.label}</Typography.Text>
                  <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                    {item.detail}
                  </Typography.Text>
                </div>
              ))}
            </Space>
          </div>
        ) : (
          <Typography.Text type="secondary">
            检查 ADB、Server、设备、保存目录、配置目录和录屏组件。
          </Typography.Text>
        )}

        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          message="ADB 一般位于 Android SDK 的 platform-tools 目录"
          description={
            <Typography.Text type="secondary" className="mono">
              {appInfo?.configPath ?? '正在读取配置路径...'}
            </Typography.Text>
          }
        />
      </Form>
    </Modal>
  )
}
