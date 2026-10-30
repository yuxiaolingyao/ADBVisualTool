import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Input,
  Modal,
  Progress,
  Space,
  Table,
  Tag,
  Typography
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowUpOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined
} from '@ant-design/icons'
import type { FileEntry, FileProgress } from '@shared/types'
import { useAppStore } from '../store/app-store'

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

export default function FilesPage(): ReactElement {
  const { message } = AntdApp.useApp()
  const { state } = useAppStore()
  const [path, setPath] = useState('/sdcard/Download')
  const [pathInput, setPathInput] = useState('/sdcard/Download')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [progress, setProgress] = useState<FileProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [operation, setOperation] = useState<'mkdir' | 'rename' | 'delete' | null>(null)
  const [operationName, setOperationName] = useState('')
  const [operationBusy, setOperationBusy] = useState(false)

  const adb = state?.adb
  const selectedDevice = state?.devices.find((device) => device.serial === state.selectedSerial)
  const canUse = Boolean(adb?.health === 'ready' && selectedDevice?.state === 'device')
  const editable =
    path === '/sdcard' ||
    path.startsWith('/sdcard/') ||
    path === '/storage/emulated/0' ||
    path.startsWith('/storage/emulated/0/')

  useEffect(() => {
    const unsubscribe = window.api.onFileProgress((next) => setProgress(next))
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!canUse) {
      setEntries([])
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    setSelected(null)
    window.api
      .listFiles(path)
      .then((result) => {
        if (!active) return
        if (result.ok && result.entries) {
          setEntries(result.entries)
          if (result.path) {
            setPath(result.path)
            setPathInput(result.path)
          }
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
  }, [canUse, path, reloadKey])

  const filtered = entries.filter((entry) =>
    entry.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  const goUp = (): void => {
    if (path === '/') return
    setPath(path.slice(0, path.lastIndexOf('/')) || '/')
  }

  const goPath = (): void => {
    const target = pathInput.trim()
    if (!target.startsWith('/')) {
      message.warning('请输入以 / 开头的手机路径')
      return
    }
    setPath(target.length > 1 && target.endsWith('/') ? target.slice(0, -1) : target)
  }

  const enterSelected = (): void => {
    if (selected?.type === 'dir') setPath(selected.path)
  }

  const onRowClick = (entry: FileEntry): void => {
    setSelected(entry)
  }

  const onRowDoubleClick = (entry: FileEntry): void => {
    if (entry.type === 'dir') setPath(entry.path)
  }

  const upload = async (): Promise<void> => {
    setTransferring(true)
    setProgress(null)
    try {
      const result = await window.api.uploadFiles(path)
      if (result.ok) {
        message.success(result.message)
        setReloadKey((value) => value + 1)
      } else {
        message.error(result.message)
      }
    } catch (errorValue) {
      message.error('上传失败：' + String(errorValue))
    } finally {
      setTransferring(false)
    }
  }

  const openOperation = (next: 'mkdir' | 'rename' | 'delete'): void => {
    if (next !== 'mkdir' && !selected) {
      message.warning('请先选择一个文件或目录')
      return
    }
    setOperation(next)
    setOperationName(next === 'rename' && selected ? selected.name : '')
  }

  const submitOperation = async (): Promise<void> => {
    if (!operation) return
    if (operation !== 'delete' && !operationName.trim()) {
      message.warning('请输入名称')
      return
    }
    if (operation === 'delete' && !selected) {
      message.warning('没有选中文件')
      return
    }
    setOperationBusy(true)
    try {
      const result =
        operation === 'mkdir'
          ? await window.api.createFolder(path, operationName.trim())
          : operation === 'rename' && selected
            ? await window.api.renameFile(selected.path, operationName.trim())
            : selected
              ? await window.api.deleteFile(selected.path)
              : { ok: false, message: '没有选中文件' }
      if (result.ok) {
        message.success(result.message)
        setOperation(null)
        setSelected(null)
        setReloadKey((value) => value + 1)
      } else {
        message.error(result.message)
      }
    } catch (errorValue) {
      message.error('操作失败：' + String(errorValue))
    } finally {
      setOperationBusy(false)
    }
  }

  const download = async (): Promise<void> => {
    if (!selected) {
      message.warning('请先选择一个文件')
      return
    }
    setTransferring(true)
    setProgress(null)
    try {
      const result = await window.api.downloadFile(selected.path)
      if (result.ok) {
        message.success(result.message + '：' + (result.filePath ?? ''))
      } else {
        message.error(result.message)
      }
    } catch (errorValue) {
      message.error('下载失败：' + String(errorValue))
    } finally {
      setTransferring(false)
    }
  }

  const columns: ColumnsType<FileEntry> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record) => (
        <Space>
          {record.type === 'dir' ? <FolderOutlined /> : <FileOutlined />}
          <Typography.Text>{value}</Typography.Text>
        </Space>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (value: string) => (
        <Tag color={value === 'dir' ? 'blue' : value === 'link' ? 'orange' : 'default'}>
          {value === 'dir' ? '目录' : value === 'link' ? '链接' : '文件'}
        </Tag>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (value: number) => (value > 0 ? formatSize(value) : '—')
    },
    {
      title: '修改时间',
      dataIndex: 'modified',
      key: 'modified',
      width: 180
    }
  ]

  return (
    <div>
      <div className="page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            文件管理
          </Typography.Title>
          <Typography.Text type="secondary">
            浏览、上传、下载、新建目录、重命名、删除。
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
        <Space wrap style={{ marginBottom: 12, width: '100%' }}>
          <Button icon={<ArrowUpOutlined />} disabled={path === '/'} onClick={goUp}>
            上一级
          </Button>
          <Input
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            onPressEnter={goPath}
            style={{ width: 360 }}
            prefix={<FolderOpenOutlined />}
          />
          <Button onClick={goPath}>转到</Button>
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
            loading={transferring}
            disabled={!canUse || transferring}
            onClick={() => void upload()}
          >
            上传文件
          </Button>
          <Button
            icon={<DownloadOutlined />}
            loading={transferring}
            disabled={!canUse || transferring || !selected || selected.type === 'dir'}
            onClick={() => void download()}
          >
            下载选中
          </Button>
          <Button
            icon={<FolderOpenOutlined />}
            disabled={!canUse || !selected || selected.type !== 'dir'}
            onClick={enterSelected}
          >
            进入选中目录
          </Button>
          <Button
            icon={<FolderAddOutlined />}
            disabled={!canUse || transferring || !editable}
            onClick={() => openOperation('mkdir')}
          >
            新建目录
          </Button>
          <Button
            icon={<EditOutlined />}
            disabled={!canUse || transferring || !selected || !editable}
            onClick={() => openOperation('rename')}
          >
            重命名
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={!canUse || transferring || !selected || !editable}
            onClick={() => openOperation('delete')}
          >
            删除
          </Button>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="筛选当前目录"
            prefix={<SearchOutlined />}
            allowClear
            style={{ width: 200 }}
          />
          <Tag>{filtered.length} 项</Tag>
          <Tag color={selected ? 'blue' : 'default'}>
            {selected ? '已选中：' + selected.name : '未选中文件'}
          </Tag>
          {selected ? (
            <Button size="small" onClick={() => setSelected(null)}>
              取消选择
            </Button>
          ) : null}
        </Space>

        {!editable ? (
          <Alert
            style={{ marginBottom: 12 }}
            type="warning"
            showIcon
            message="当前是系统目录，只读；新建目录、重命名、删除已禁用。"
          />
        ) : null}

        {progress ? (
          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary">
              {progress.operation === 'upload' ? '上传' : '下载'} {progress.name}
              {progress.message ? '：' + progress.message : ''}
            </Typography.Text>
            <Progress percent={progress.percent} size="small" />
          </div>
        ) : null}

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

        <Table<FileEntry>
          rowKey="path"
          size="small"
          loading={loading}
          columns={columns}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selected ? [selected.path] : [],
            onChange: (keys) => {
              const key = String(keys[0] ?? '')
              setSelected(entries.find((entry) => entry.path === key) ?? null)
            }
          }}
          dataSource={filtered}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          scroll={{ y: 520 }}
          rowClassName={(record) => (record.path === selected?.path ? 'file-row-selected' : '')}
          onRow={(record) => ({
            onClick: () => onRowClick(record),
            onDoubleClick: () => onRowDoubleClick(record)
          })}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          单击选中，双击目录进入；下载保存到 Downloads/ADB工具箱/files。
        </Typography.Paragraph>
      </Card>

      <Modal
        title={
          operation === 'mkdir' ? '新建目录' : operation === 'rename' ? '重命名' : '删除文件/目录'
        }
        open={operation !== null}
        onCancel={() => setOperation(null)}
        footer={[
          <Button key="cancel" onClick={() => setOperation(null)}>
            取消
          </Button>,
          <Button
            key="ok"
            type="primary"
            danger={operation === 'delete'}
            loading={operationBusy}
            disabled={
              operation === 'delete' ? !selected : !operationName.trim()
            }
            onClick={() => void submitOperation()}
          >
            {operation === 'delete' ? '删除' : operation === 'rename' ? '重命名' : '创建'}
          </Button>
        ]}
      >
        {operation === 'delete' ? (
          <Alert
            style={{ marginBottom: 12 }}
            type="warning"
            showIcon
            message={'将执行 rm -rf，删除后不可恢复。目标：' + (selected?.path ?? '')}
          />
        ) : null}
        {operation === 'delete' ? (
          <Typography.Paragraph>
            目标：<Typography.Text code>{selected?.path ?? ''}</Typography.Text>
            <br />
            二次确认后执行删除。
          </Typography.Paragraph>
        ) : (
          <>
            <Typography.Paragraph type="secondary">当前目录：{path}</Typography.Paragraph>
            <Input
              value={operationName}
              onChange={(event) => setOperationName(event.target.value)}
              placeholder={operation === 'rename' ? '新名称' : '目录名'}
              onPressEnter={() => {
                if (!operationBusy) void submitOperation()
              }}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
