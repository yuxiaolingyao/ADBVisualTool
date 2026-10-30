import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography
} from 'antd'
import {
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  StopOutlined
} from '@ant-design/icons'
import type { CommandResult } from '@shared/types'
import { useAppStore } from '../store/app-store'

interface TerminalEntry {
  id: number
  command: string
  ok: boolean
  running?: boolean
  message?: string
  output: string
  timestamp: string
}

const HISTORY_KEY = 'adb-tool-terminal-history'

const TEMPLATE_GROUPS = [
  {
    label: '设备',
    options: [
      { value: 'getprop ro.product.model', label: '设备型号' },
      { value: 'getprop ro.build.version.release', label: 'Android 版本' },
      { value: 'wm size', label: '屏幕分辨率' },
      { value: 'wm density', label: '屏幕密度' }
    ]
  },
  {
    label: '日志',
    options: [
      { value: 'logcat -c', label: '清空日志' },
      { value: 'logcat -v time', label: '实时日志' },
      { value: 'logcat -b crash -d', label: '崩溃缓冲' }
    ]
  },
  {
    label: '应用',
    options: [
      { value: 'pm list packages -3', label: '用户应用列表' },
      { value: 'dumpsys package <包名> | grep version', label: '版本信息' },
      { value: 'pm path <包名>', label: 'APK 路径' },
      { value: 'am force-stop <包名>', label: '强制停止' }
    ]
  },
  {
    label: '性能',
    options: [
      { value: 'dumpsys battery', label: '电池' },
      { value: 'dumpsys meminfo <包名>', label: '内存' },
      { value: 'dumpsys cpuinfo', label: 'CPU' },
      { value: 'dumpsys gfxinfo <包名> framestats', label: '帧率' },
      { value: 'dumpsys thermalservice', label: '温度' }
    ]
  },
  {
    label: '文件',
    options: [
      { value: 'ls -la /sdcard/Download', label: '下载目录' },
      { value: 'df -h', label: '存储空间' }
    ]
  }
]
const DANGEROUS = /\b(rm|reboot|pm\s+clear|uninstall|mkfs|dd|su|settings\s+put|mount|chmod|stop|start)\b/i

function loadHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export default function TerminalPage(): ReactElement {
  const { message } = AntdApp.useApp()
  const { state } = useAppStore()
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>(loadHistory)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [entries, setEntries] = useState<TerminalEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [dangerOpen, setDangerOpen] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeEntryIdRef = useRef<number | null>(null)

  const adb = state?.adb
  const selectedDevice = state?.devices.find((device) => device.serial === state.selectedSerial)
  const canUse = Boolean(adb?.health === 'ready' && selectedDevice?.state === 'device')

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch {
      // 本地存储不可用时忽略
    }
  }, [history])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [entries, busy])

  useEffect(() => {
    return window.api.onTerminalOutput((chunk) => {
      const id = activeEntryIdRef.current
      if (id === null) return
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === id
            ? { ...entry, output: (entry.output + chunk).slice(-400000) }
            : entry
        )
      )
    })
  }, [])

  const runCommand = async (raw: string, confirmed = false): Promise<void> => {
    const text = raw.trim()
    if (!text) return
    if (!canUse) {
      message.warning('请先选择一台已连接设备')
      return
    }
    if (!confirmed && DANGEROUS.test(text)) {
      setPendingCommand(text)
      setDangerOpen(true)
      return
    }
    const id = Date.now()
    activeEntryIdRef.current = id
    setEntries((previous) => [
      ...previous,
      {
        id,
        command: text,
        ok: true,
        running: true,
        message: '执行中…',
        output: '',
        timestamp: new Date().toLocaleTimeString()
      }
    ])
    setBusy(true)
    try {
      const result: CommandResult = await window.api.runShell(text)
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ok: result.ok,
                running: false,
                message: result.message,
                output: result.output || entry.output || result.message
              }
            : entry
        )
      )
      setHistory((previous) => [...previous.filter((item) => item !== text), text].slice(-100))
      setHistoryIndex(-1)
      setCommand('')
    } catch (errorValue) {
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ok: false,
                running: false,
                message: '执行失败',
                output: entry.output || '执行失败：' + String(errorValue)
              }
            : entry
        )
      )
    } finally {
      activeEntryIdRef.current = null
      setBusy(false)
    }
  }

  const handleCancel = async (): Promise<void> => {
    setCancelling(true)
    try {
      const result = await window.api.cancelShell()
      if (result.ok) message.info('已发送终止')
      else message.warning(result.message)
    } catch (errorValue) {
      message.error('终止失败：' + String(errorValue))
    } finally {
      setCancelling(false)
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (history.length === 0) return
      const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(next)
      setCommand(history[next])
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (historyIndex < 0) return
      const next = historyIndex + 1
      if (next >= history.length) {
        setHistoryIndex(-1)
        setCommand('')
      } else {
        setHistoryIndex(next)
        setCommand(history[next])
      }
    }
  }

  const clearTerminal = (): void => {
    setEntries([])
    setPendingCommand(null)
  }

  const clearHistory = (): void => {
    setHistory([])
    setHistoryIndex(-1)
    try {
      window.localStorage.removeItem(HISTORY_KEY)
    } catch {
      // 忽略
    }
  }

  const copyAll = async (): Promise<void> => {
    if (entries.length === 0) return
    const text = entries
      .map((entry) => '$ ' + entry.command + '\n' + entry.output)
      .join('\n\n')
    await window.api.copyText(text)
    message.success('终端内容已复制')
  }

  return (
    <div>
      <div className="page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            终端
          </Typography.Title>
          <Typography.Text type="secondary">
            执行 adb shell 命令，显示输出，支持历史、清空和危险命令确认。
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
        <div className="terminal-output" ref={scrollRef}>
          {entries.length === 0 ? (
            <Typography.Text type="secondary">
              输入 adb shell 命令，例如 getprop ro.product.model。每条命令使用独立 shell，cd 不会跨命令保留。
            </Typography.Text>
          ) : (
            entries.map((entry) => (
              <div className="terminal-entry" key={entry.id}>
                <div className="terminal-command">
                  <span>$ {entry.command}</span>
                  <Tag color={entry.running ? 'processing' : entry.ok ? 'success' : 'error'}>
                    {entry.running ? '执行中' : entry.ok ? '成功' : '失败'}
                  </Tag>
                  <Typography.Text type={entry.ok ? 'success' : 'danger'}>
                    {entry.message}
                  </Typography.Text>
                  <Typography.Text type="secondary">{entry.timestamp}</Typography.Text>
                </div>
                <pre className="command-output">
                  {entry.output || (entry.running ? '等待输出…' : '（无输出）')}
                </pre>
              </div>
            ))
          )}
          {busy ? <Typography.Text type="secondary">执行中…</Typography.Text> : null}
        </div>

        <Space wrap style={{ marginTop: 12, width: '100%' }}>
          <Select
            showSearch
            placeholder="模板（只填入）"
            style={{ width: 220 }}
            options={TEMPLATE_GROUPS}
            optionFilterProp="label"
            onChange={(value) => {
              setCommand(value)
              setHistoryIndex(-1)
            }}
          />
          <Input
            value={command}
            onChange={(event) => {
              setCommand(event.target.value)
              setHistoryIndex(-1)
            }}
            onPressEnter={() => void runCommand(command)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            placeholder="输入 adb shell 命令，↑/↓ 翻历史"
            style={{ width: 560 }}
            addonBefore="adb shell"
          />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={busy && !cancelling}
            disabled={!canUse || busy || !command.trim()}
            onClick={() => void runCommand(command)}
          >
            执行
          </Button>
          <Button
            danger
            icon={<StopOutlined />}
            loading={cancelling}
            disabled={!busy || cancelling}
            onClick={() => void handleCancel()}
          >
            终止
          </Button>
          <Button icon={<ClearOutlined />} onClick={clearTerminal}>
            清空终端
          </Button>
          <Button icon={<DeleteOutlined />} onClick={clearHistory}>
            清空历史
          </Button>
          <Button icon={<CopyOutlined />} disabled={entries.length === 0} onClick={() => void copyAll()}>
            复制全部
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          模板只填入输入框，不自动执行；带 &lt;包名&gt; 的命令先替换再执行。
        </Typography.Paragraph>

        {history.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">历史（点击填入）</Typography.Text>
            <div style={{ marginTop: 6 }}>
              <Space wrap>
                {history.slice(-8).reverse().map((item, index) => (
                  <Button
                    key={item + '-' + index}
                    size="small"
                    onClick={() => {
                      setCommand(item)
                      setHistoryIndex(-1)
                    }}
                  >
                    {item.length > 48 ? item.slice(0, 48) + '…' : item}
                  </Button>
                ))}
              </Space>
            </div>
          </div>
        ) : null}
      </Card>

      <Modal
        title="危险命令确认"
        open={dangerOpen}
        onCancel={() => {
          setDangerOpen(false)
          setPendingCommand(null)
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setDangerOpen(false)
              setPendingCommand(null)
            }}
          >
            取消
          </Button>,
          <Button
            key="run"
            danger
            type="primary"
            onClick={() => {
              const target = pendingCommand
              setDangerOpen(false)
              setPendingCommand(null)
              if (target) void runCommand(target, true)
            }}
          >
            仍然执行
          </Button>
        ]}
      >
        <Typography.Paragraph>命令可能修改设备数据或系统状态，请确认：</Typography.Paragraph>
        <Typography.Text code>{pendingCommand}</Typography.Text>
      </Modal>
    </div>
  )
}
