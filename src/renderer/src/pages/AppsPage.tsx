import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  List,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
  Typography
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AppstoreOutlined,
  ClearOutlined,
  DeleteOutlined,
  FieldTimeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined
} from '@ant-design/icons'
import type { AppDetail, AppFilter, AppListItem, CommandResult } from '@shared/types'
import { useAppStore } from '../store/app-store'

const FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '用户应用', value: 'user' },
  { label: '系统应用', value: 'system' }
]

export default function AppsPage(): ReactElement {
  const { message } = AntdApp.useApp()
  const { state } = useAppStore()
  const [filter, setFilter] = useState<AppFilter>('all')
  const [search, setSearch] = useState('')
  const [apps, setApps] = useState<AppListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<AppListItem | null>(null)
  const [detail, setDetail] = useState<AppDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'clear' | 'uninstall' | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [coldStart, setColdStart] = useState<CommandResult | null>(null)

  const adb = state?.adb
  const selectedDevice = state?.devices.find((device) => device.serial === state.selectedSerial)
  const canUse = Boolean(adb?.health === 'ready' && selectedDevice?.state === 'device')

  useEffect(() => {
    if (!canUse) {
      setApps([])
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    window.api
      .listApps(filter)
      .then((result) => {
        if (!active) return
        if (result.ok && result.apps) {
          setApps(result.apps)
        } else {
          setError(result.message)
        }
      })
      .catch((errorValue) => {
        if (active) setError(String(errorValue))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [canUse, filter, reloadKey])

  const filteredApps = apps.filter((item) =>
    item.packageName.toLowerCase().includes(search.trim().toLowerCase())
  )

  const openDetail = async (item: AppListItem): Promise<void> => {
    setSelected(item)
    setDetail(null)
    setColdStart(null)
    setDrawerOpen(true)
    setDetailLoading(true)
    try {
      const result = await window.api.getAppDetail(item.packageName)
      if (result.ok && result.detail) setDetail(result.detail)
      else message.error(result.message)
    } catch (errorValue) {
      message.error('读取应用详情失败：' + String(errorValue))
    } finally {
      setDetailLoading(false)
    }
  }

  const reloadDetail = async (packageName: string): Promise<void> => {
    const result = await window.api.getAppDetail(packageName)
    if (result.ok && result.detail) setDetail(result.detail)
  }

  const installApk = async (): Promise<void> => {
    setActionBusy('install')
    try {
      const result = await window.api.installApk()
      if (result.ok) {
        message.success(result.message)
        setReloadKey((value) => value + 1)
      } else {
        message.error(result.message)
      }
    } catch (errorValue) {
      message.error('安装 APK 失败：' + String(errorValue))
    } finally {
      setActionBusy(null)
    }
  }

  const startSelected = async (): Promise<void> => {
    if (!selected) return
    setActionBusy('start')
    try {
      const result = await window.api.startPackage(selected.packageName)
      if (result.ok) message.success(result.message)
      else message.error(result.message)
    } finally {
      setActionBusy(null)
    }
  }

  const stopSelected = async (): Promise<void> => {
    if (!selected) return
    setActionBusy('stop')
    try {
      const result = await window.api.forceStopPackage(selected.packageName)
      if (result.ok) message.success(result.message)
      else message.error(result.message)
    } finally {
      setActionBusy(null)
    }
  }

  const measureColdStart = async (): Promise<void> => {
    if (!selected || !detail?.launcherActivity) {
      message.warning('这个应用没有可用的启动 Activity')
      return
    }
    setActionBusy('cold')
    setColdStart(null)
    try {
      const result = await window.api.runShell(
        'am start -W -S -n ' + detail.launcherActivity
      )
      setColdStart(result)
      if (result.ok) message.success('冷启动完成，查看下方耗时')
      else message.error(result.message)
    } catch (errorValue) {
      message.error('冷启动失败：' + String(errorValue))
    } finally {
      setActionBusy(null)
    }
  }

  const requestConfirm = (action: 'clear' | 'uninstall'): void => {
    if (!selected) return
    setConfirmText('')
    setConfirmAction(action)
  }

  const confirmOperation = async (): Promise<void> => {
    if (!selected || !confirmAction) return
    if (confirmText.trim() !== selected.packageName) {
      message.warning('包名不一致，操作已取消')
      return
    }
    const packageName = selected.packageName
    setActionBusy(confirmAction)
    try {
      if (confirmAction === 'clear') {
        const result = await window.api.clearPackageData(packageName)
        if (result.ok) {
          message.success(result.message)
          await reloadDetail(packageName)
        } else {
          message.error(result.message)
        }
      } else {
        const result = await window.api.uninstallPackage(packageName)
        if (result.ok) {
          message.success(result.message)
          setDrawerOpen(false)
          setSelected(null)
          setDetail(null)
          setReloadKey((value) => value + 1)
        } else {
          message.error(result.message)
        }
      }
      setConfirmAction(null)
    } catch (errorValue) {
      message.error('操作失败：' + String(errorValue))
    } finally {
      setActionBusy(null)
    }
  }

  const columns: ColumnsType<AppListItem> = [
    {
      title: '包名',
      dataIndex: 'packageName',
      key: 'packageName',
      render: (value: string) => (
        <Typography.Text className="mono" copyable={{ text: value }}>
          {value}
        </Typography.Text>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (value: string) => (
        <Tag color={value === 'user' ? 'blue' : 'default'}>
          {value === 'user' ? '用户应用' : '系统应用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, record) => (
        <Button size="small" type="link" onClick={() => void openDetail(record)}>
          详情
        </Button>
      )
    }
  ]

  return (
    <div>
      <div className="page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            应用管理
          </Typography.Title>
          <Typography.Text type="secondary">
            应用列表、搜索、版本/路径/Activity/权限、安装与卸载。
          </Typography.Text>
        </div>
      </div>

      {!canUse ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          message={
            adb?.health !== 'ready'
              ? 'ADB 不可用，请先到“设备与设置”配置 adb.exe'
              : '请先在顶部或设备页选择一台已连接设备'
          }
        />
      ) : null}

      <Card className="page-card">
        <Space wrap style={{ marginBottom: 12 }}>
          <Segmented
            value={filter}
            options={FILTER_OPTIONS}
            onChange={(value) => setFilter(value as AppFilter)}
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="按包名搜索"
            prefix={<SearchOutlined />}
            allowClear
            style={{ width: 260 }}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            disabled={!canUse}
            onClick={() => setReloadKey((value) => value + 1)}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={actionBusy === 'install'}
            disabled={!canUse || actionBusy !== null}
            onClick={() => void installApk()}
          >
            安装 APK
          </Button>
          <Tag icon={<AppstoreOutlined />}>
            共 {filteredApps.length} 个{search.trim() ? '匹配' : ''}
          </Tag>
        </Space>

        {error ? (
          <Alert
            style={{ marginBottom: 12 }}
            type="error"
            showIcon
            message={error}
            action={
              <Button size="small" onClick={() => setReloadKey((value) => value + 1)}>
                重试
              </Button>
            }
          />
        ) : null}

        <Table<AppListItem>
          rowKey="packageName"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={filteredApps}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ y: 520 }}
          onRow={(record) => ({
            onClick: () => void openDetail(record)
          })}
        />
      </Card>

      <Drawer
        title={selected?.packageName ?? '应用详情'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
      >
        {detailLoading ? (
          <Typography.Text type="secondary">正在读取详情…</Typography.Text>
        ) : detail ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Space wrap>
              <Button
                icon={<PlayCircleOutlined />}
                loading={actionBusy === 'start'}
                disabled={actionBusy !== null}
                onClick={() => void startSelected()}
              >
                启动应用
              </Button>
              <Button
                icon={<StopOutlined />}
                loading={actionBusy === 'stop'}
                disabled={actionBusy !== null}
                onClick={() => void stopSelected()}
              >
                强制停止
              </Button>
              <Button
                icon={<FieldTimeOutlined />}
                loading={actionBusy === 'cold'}
                disabled={actionBusy !== null || !detail.launcherActivity}
                onClick={() => void measureColdStart()}
              >
                冷启动耗时
              </Button>
              <Button
                danger
                icon={<ClearOutlined />}
                disabled={actionBusy !== null}
                onClick={() => requestConfirm('clear')}
              >
                清除数据
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={actionBusy !== null}
                onClick={() => requestConfirm('uninstall')}
              >
                卸载
              </Button>
            </Space>
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                { key: 'versionName', label: '版本名', children: detail.versionName ?? '—' },
                { key: 'versionCode', label: '版本号', children: detail.versionCode ?? '—' },
                {
                  key: 'activity',
                  label: '启动 Activity',
                  children: (
                    <Typography.Text className="mono" copyable={{ text: detail.launcherActivity ?? '' }}>
                      {detail.launcherActivity ?? '—'}
                    </Typography.Text>
                  )
                },
                {
                  key: 'codePath',
                  label: 'APK 路径',
                  children: (
                    <Typography.Text className="mono" copyable={{ text: detail.codePath ?? '' }}>
                      {detail.codePath ?? '—'}
                    </Typography.Text>
                  )
                },
                {
                  key: 'dataDir',
                  label: '数据目录',
                  children: (
                    <Typography.Text className="mono" copyable={{ text: detail.dataDir ?? '' }}>
                      {detail.dataDir ?? '—'}
                    </Typography.Text>
                  )
                },
                { key: 'first', label: '首次安装', children: detail.firstInstallTime ?? '—' },
                { key: 'update', label: '最后更新', children: detail.lastUpdateTime ?? '—' }
              ]}
            />
            {coldStart ? (
              <Card
                size="small"
                title="冷启动结果"
                extra={
                  <Tag color={coldStart.ok ? 'success' : 'error'}>
                    {coldStart.ok ? '完成' : '失败'}
                  </Tag>
                }
              >
                <pre className="command-output">
                  {coldStart.output || coldStart.message}
                </pre>
              </Card>
            ) : null}
            <div>
              <Typography.Text strong>声明权限（{detail.permissions.length}）</Typography.Text>
              <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 8 }}>
                {detail.permissions.length > 0 ? (
                  <List
                    size="small"
                    dataSource={detail.permissions}
                    renderItem={(permission) => (
                      <List.Item>
                        <Typography.Text className="mono" copyable={{ text: permission }}>
                          {permission}
                        </Typography.Text>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Typography.Text type="secondary">没有读取到声明权限</Typography.Text>
                )}
              </div>
            </div>
          </Space>
        ) : (
          <Typography.Text type="secondary">没有读取到详情</Typography.Text>
        )}
      </Drawer>

      <Modal
        title={confirmAction === 'uninstall' ? '确认卸载应用？' : '确认清除应用数据？'}
        open={confirmAction !== null}
        onCancel={() => setConfirmAction(null)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmAction(null)}>
            取消
          </Button>,
          <Button
            key="ok"
            danger
            loading={confirmAction !== null && actionBusy === confirmAction}
            disabled={!selected || confirmText.trim() !== selected.packageName}
            onClick={() => void confirmOperation()}
          >
            {confirmAction === 'uninstall' ? '卸载' : '清除数据'}
          </Button>
        ]}
      >
        <Typography.Paragraph>
          {confirmAction === 'uninstall'
            ? '会执行 adb uninstall，应用和它的数据都会删除。'
            : '会执行 pm clear，登录状态和本地数据都会丢失。'}
        </Typography.Paragraph>
        <Typography.Paragraph>
          目标包名：<Typography.Text code>{selected?.packageName ?? '—'}</Typography.Text>
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          为防止误操作，请手动输入上面的包名后确认。
        </Typography.Paragraph>
        <Input
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder="输入完整包名"
        />
      </Modal>
    </div>
  )
}
