import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Table,
  Tag,
  Typography
} from 'antd'
import type { TableProps } from 'antd'
import {
  CopyOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  ReloadOutlined,
  SettingOutlined,
  StopOutlined
} from '@ant-design/icons'
import { deviceStateKind, deviceStateLabel } from '@shared/parsers'
import type { DeviceSummary } from '@shared/types'
import { useAppStore } from '../store/app-store'

function stateColor(state: string): string {
  switch (deviceStateKind(state)) {
    case 'device':
      return 'success'
    case 'unauthorized':
      return 'warning'
    case 'offline':
      return 'error'
    case 'no-permissions':
      return 'error'
    default:
      return 'default'
  }
}

function healthTag(health: string | undefined): ReactElement {
  switch (health) {
    case 'ready':
      return <Tag color="success">可用</Tag>
    case 'checking':
      return <Tag color="processing">检测中</Tag>
    case 'not-configured':
      return <Tag color="warning">未配置</Tag>
    case 'invalid':
      return <Tag color="error">路径无效</Tag>
    case 'error':
      return <Tag color="error">异常</Tag>
    default:
      return <Tag>未知</Tag>
  }
}

export default function DevicePage(): ReactElement {
  const { message } = AntdApp.useApp()
  const {
    state,
    config,
    appInfo,
    refreshDevices,
    selectDevice,
    detectAdb,
    setAdbPath,
    adbServer,
    openSettings
  } = useAppStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  if (!state) {
    return (
      <Card className="page-card">
        <Typography.Text type="secondary">正在读取设备状态...</Typography.Text>
      </Card>
    )
  }

  const adb = state.adb
  const hasAdb = adb.health === 'ready'
  const serverStopped = adb.health === 'ready' && !adb.serverRunning
  const selected = state.selectedSerial
    ? state.devices.find((device) => device.serial === state.selectedSerial)
    : undefined
  const detail = state.selectedDetail
  const foreground = state.foregroundApp
  const unauthorized = state.devices.filter(
    (device) => deviceStateKind(device.state) === 'unauthorized'
  )
  const offline = state.devices.filter((device) => deviceStateKind(device.state) === 'offline')
  const noPermissions = state.devices.filter(
    (device) => deviceStateKind(device.state) === 'no-permissions'
  )
  const detailError = state.error?.code === 'DEVICE_DETAIL_FAILED' ? state.error : null
  const topError = state.error && (!detailError || !selected) ? state.error : null

  const handleRefresh = async (): Promise<void> => {
    if (serverStopped) {
      message.info('ADB Server 已停止，请先点“启动 Server”')
      return
    }
    if (busy) return
    setRefreshing(true)
    try {
      await refreshDevices()
    } catch (error) {
      message.error('刷新失败：' + String(error))
    } finally {
      setRefreshing(false)
    }
  }

  const handleCopy = async (text: string, label: string): Promise<void> => {
    try {
      await window.api.copyText(text)
      message.success(label + '已复制')
    } catch (error) {
      message.error('复制失败：' + String(error))
    }
  }

  const handleDetect = async (): Promise<void> => {
    setBusy('detect')
    try {
      const detected = await detectAdb()
      if (detected.bestPath) {
        await setAdbPath(detected.bestPath)
        message.success('已检测到 ADB：' + (detected.bestVersion ?? detected.bestPath))
      } else {
        message.warning(detected.error ?? '没有找到可用的 adb.exe')
      }
    } catch (error) {
      message.error('检测失败：' + String(error))
    } finally {
      setBusy(null)
    }
  }

  const handlePick = async (): Promise<void> => {
    setBusy('pick')
    try {
      const selectedPath = await window.api.pickAdbFile()
      if (!selectedPath) return
      await setAdbPath(selectedPath)
      const nextState = await window.api.getState()
      if (nextState.adb.health === 'ready') {
        message.success('ADB 已配置：' + (nextState.adb.version ?? selectedPath))
      } else {
        message.error(nextState.adb.message ?? 'ADB 不可用，请检查路径')
      }
    } catch (error) {
      message.error('选择失败：' + String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async (): Promise<void> => {
    const adbPath = config?.adbPath
    if (!adbPath) {
      message.warning('请先选择 adb.exe')
      return
    }
    setBusy('test')
    try {
      const result = await window.api.validateAdb(adbPath)
      if (result.ok) {
        message.success('ADB 可用，版本：' + (result.version ?? '未知'))
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error('测试失败：' + String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleServer = async (action: 'start' | 'stop' | 'restart'): Promise<void> => {
    setBusy(action)
    try {
      const result = await adbServer(action)
      if (result.ok) {
        message.success(result.message)
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error('ADB Server 操作失败：' + String(error))
    } finally {
      setBusy(null)
    }
  }

  const handleOpenConfig = async (): Promise<void> => {
    if (!appInfo) return
    const result = await window.api.openPath(appInfo.userDataPath)
    if (!result.ok) message.error(result.message)
  }

  const columns: TableProps<DeviceSummary>['columns'] = [
    {
      title: '状态',
      dataIndex: 'state',
      width: 100,
      render: (value: string) => (
        <Tag color={stateColor(value)}>{deviceStateLabel(value)}</Tag>
      )
    },
    {
      title: '序列号',
      dataIndex: 'serial',
      width: 220,
      render: (value: string) => (
        <Typography.Text code copyable={false} className="mono">
          {value}
        </Typography.Text>
      )
    },
    {
      title: '型号',
      dataIndex: 'model',
      render: (value: string | undefined) => value ?? '—'
    },
    {
      title: '产品',
      dataIndex: 'product',
      render: (value: string | undefined) => value ?? '—'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, device: DeviceSummary) => (
        <Space size="small">
          <Button
            size="small"
            type={device.serial === state.selectedSerial ? 'primary' : 'default'}
            onClick={() => void selectDevice(device.serial)}
          >
            选择
          </Button>
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            onClick={() => void handleCopy(device.serial, '序列号')}
          />
        </Space>
      )
    }
  ]

  const adbDescriptions = [
    {
      key: 'health',
      label: '状态',
      children: healthTag(adb.health)
    },
    {
      key: 'version',
      label: '版本',
      children: adb.version ?? '—'
    },
    {
      key: 'server',
      label: 'Server',
      children: adb.serverRunning ? <Tag color="success">运行中</Tag> : <Tag>未运行</Tag>
    },
    {
      key: 'path',
      label: '路径',
      children: (
        <Typography.Text className="mono" ellipsis={{ tooltip: adb.path ?? '' }}>
          {adb.path ?? '还没有配置'}
        </Typography.Text>
      )
    }
  ]

  const detailDescriptions = [
    { key: 'serial', label: '序列号', children: selected?.serial ?? '—' },
    { key: 'state', label: '状态', children: selected ? <Tag color={stateColor(selected.state)}>{deviceStateLabel(selected.state)}</Tag> : '—' },
    { key: 'brand', label: '品牌', children: detail?.brand ?? '—' },
    { key: 'model', label: '型号', children: detail?.model ?? selected?.model ?? '—' },
    { key: 'android', label: 'Android 版本', children: detail?.androidVersion ?? '—' },
    { key: 'sdk', label: 'SDK', children: detail?.sdk ?? '—' },
    { key: 'product', label: '产品', children: selected?.product ?? '—' },
    { key: 'transport', label: '传输 ID', children: selected?.transportId ?? '—' }
  ]

  const diagnostics = serverStopped ? (
    <Alert
      type="info"
      showIcon
      message="ADB Server 已停止"
      description="点“启动 Server”后会重新检测设备。"
    />
  ) : !hasAdb ? (
    <Alert
      type={adb.health === 'not-configured' ? 'warning' : 'error'}
      showIcon
      message={adb.health === 'not-configured' ? '还没有配置 ADB' : 'ADB 不可用'}
      description={
        <div className="diagnostic-steps">
          <span>{adb.message ?? '请先选择 platform-tools 目录下的 adb.exe。'}</span>
          <span>常见位置：Android SDK\platform-tools\adb.exe</span>
          <span>也可以点击“自动检测”，让工具扫描 ANDROID_HOME、PATH 和常见 SDK 目录。</span>
        </div>
      }
    />
  ) : state.devices.length === 0 ? (
    <Alert
      type="warning"
      showIcon
      message="没有检测到 USB 设备"
      description={
        <div className="diagnostic-steps">
          <span>1. 手机进入“设置 → 关于手机”，连续点版本号打开开发者选项。</span>
          <span>2. 打开“USB 调试”。</span>
          <span>3. 用数据线连接电脑，USB 配置选择“传输文件/调试”。</span>
          <span>4. 手机弹出“允许 USB 调试吗？”时点允许，建议勾选“始终允许”。</span>
          <span>5. 换一根数据线/换 USB 口，或点“重启 ADB Server”。</span>
        </div>
      }
    />
  ) : unauthorized.length > 0 ? (
    <Alert
      type="error"
      showIcon
      message="设备未授权"
      description={
        <div className="diagnostic-steps">
          <span>手机已连上，但还没有允许这台电脑调试。</span>
          <span>解锁手机，在“允许 USB 调试吗？”弹窗点允许，并勾选“始终允许”。</span>
          <span>如果没有弹窗：开发者选项里点“撤销 USB 调试授权”，重新插拔数据线。</span>
        </div>
      }
    />
  ) : offline.length > 0 ? (
    <Alert
      type="warning"
      showIcon
      message="设备离线"
      description={
        <div className="diagnostic-steps">
          <span>设备被识别到，但 ADB 连接不稳定。</span>
          <span>重新插拔数据线，换 USB 口，或点“重启 ADB Server”。</span>
        </div>
      }
    />
  ) : noPermissions.length > 0 ? (
    <Alert
      type="error"
      showIcon
      message="设备无访问权限"
      description="Windows 驱动或 USB 权限可能有问题。可以尝试重装厂商 USB 驱动，或换一个 USB 口。"
    />
  ) : selected && selected.state === 'device' ? (
    <Alert
      type="success"
      showIcon
      message="设备已连接"
      description="可以开始抓日志、截图、录屏和执行快捷测试指令。"
    />
  ) : (
    <Alert
      type="info"
      showIcon
      message="检测到多台设备"
      description="请在上方设备列表或顶部下拉框中选择当前测试设备。"
    />
  )

  return (
    <div>
      <div className="page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            设备与 ADB 环境
          </Typography.Title>
          <Typography.Text type="secondary">
            识别 USB 设备、查看设备信息、配置 ADB。
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<SettingOutlined />} onClick={openSettings}>
            设置
          </Button>
        </Space>
      </div>

      {topError ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message="操作失败"
          description={
            <div className="diagnostic-steps">
              <span>{topError.message}</span>
              <span className="mono">错误码：{topError.code}</span>
            </div>
          }
          action={
            <Button
              size="small"
              disabled={serverStopped || busy !== null}
              onClick={() => void handleRefresh()}
            >
              重试
            </Button>
          }
        />
      ) : null}

      <Row gutter={[16, 16]} className="page-grid">
        <Col xs={24} xl={14}>
          <Card
            className="page-card"
            title="ADB 环境"
            extra={serverStopped ? <Tag>已停止</Tag> : healthTag(adb.health)}
          >
            {adb.message ? (
              <Alert
                style={{ marginBottom: 12 }}
                type={serverStopped ? 'info' : adb.health === 'ready' ? 'success' : 'error'}
                showIcon
                message={adb.message}
              />
            ) : null}
            <Descriptions size="small" column={2} items={adbDescriptions} />
            <Space wrap className="action-row">
              <Button
                icon={<ReloadOutlined />}
                loading={busy === 'detect'}
                disabled={busy !== null}
                onClick={() => void handleDetect()}
              >
                自动检测
              </Button>
              <Button
                loading={busy === 'pick'}
                disabled={busy !== null}
                onClick={() => void handlePick()}
              >
                选择 adb.exe
              </Button>
              <Button
                loading={busy === 'test'}
                disabled={!config?.adbPath || busy !== null}
                onClick={() => void handleTest()}
              >
                测试 ADB
              </Button>
              <Button
                icon={<PlayCircleOutlined />}
                loading={busy === 'start'}
                disabled={!hasAdb || busy !== null}
                onClick={() => void handleServer('start')}
              >
                启动 Server
              </Button>
              <Button
                icon={<StopOutlined />}
                loading={busy === 'stop'}
                disabled={!hasAdb || busy !== null || serverStopped}
                onClick={() => void handleServer('stop')}
              >
                停止 Server
              </Button>
              <Button
                icon={<RedoOutlined />}
                loading={busy === 'restart'}
                disabled={!hasAdb || busy !== null}
                onClick={() => void handleServer('restart')}
              >
                重启 Server
              </Button>
              <Button
                icon={<FolderOpenOutlined />}
                disabled={busy !== null}
                onClick={() => void handleOpenConfig()}
              >
                打开配置目录
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card className="page-card" title="连接诊断">
            {diagnostics}
          </Card>
        </Col>

        <Col span={24}>
          <Card
            className="page-card"
            title="USB 设备"
            extra={
              <Space>
                <Typography.Text type="secondary">
                  共 {state.devices.length} 台
                </Typography.Text>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={refreshing}
                  disabled={serverStopped || busy !== null}
                  title={serverStopped ? 'ADB Server 已停止，请先启动' : undefined}
                  onClick={() => void handleRefresh()}
                >
                  刷新
                </Button>
              </Space>
            }
          >
            <Table<DeviceSummary>
              rowKey="serial"
              size="small"
              columns={columns}
              dataSource={state.devices}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="没有检测到 USB 设备，按右侧诊断步骤检查"
                  />
                )
              }}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Card
            className="page-card"
            title="当前测试设备"
            extra={
              selected ? (
                <Space>
                  <Tag color={stateColor(selected.state)}>
                    {deviceStateLabel(selected.state)}
                  </Tag>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void handleCopy(selected.serial, '序列号')}
                  >
                    复制序列号
                  </Button>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    disabled={serverStopped || busy !== null}
                    title={serverStopped ? 'ADB Server 已停止，请先启动' : undefined}
                    onClick={() => void handleRefresh()}
                  >
                    刷新信息
                  </Button>
                </Space>
              ) : null
            }
          >
            {selected ? (
              <>
                {detailError ? (
                  <Alert
                    style={{ marginBottom: 12 }}
                    type="error"
                    showIcon
                    message="设备信息读取失败"
                    description={
                      <div className="diagnostic-steps">
                        <span>{detailError.message}</span>
                        <span className="mono">错误码：{detailError.code}</span>
                      </div>
                    }
                    action={
                      <Button
                        size="small"
                        disabled={serverStopped || busy !== null}
                        onClick={() => void handleRefresh()}
                      >
                        重试
                      </Button>
                    }
                  />
                ) : null}
                <Descriptions size="small" column={2} items={detailDescriptions} />
                <div className="foreground-panel">
                  <div className="foreground-label">当前前台应用</div>
                  <div className="foreground-value">
                    {foreground ? (
                      <>
                        <Typography.Text code className="mono">
                          {foreground.packageName}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {foreground.activity ?? ''}
                        </Typography.Text>
                      </>
                    ) : (
                      <Typography.Text type="secondary">
                        暂时读不到（可能停在系统桌面，或 ROM 限制了 dumpsys 输出）
                      </Typography.Text>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <Empty description="请选择一台设备" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
