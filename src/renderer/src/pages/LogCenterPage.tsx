import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Form,
  Input,
  Modal,
  Radio,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd'
import {
  AimOutlined,
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  StopOutlined,
  VerticalAlignBottomOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { parseLogcatLine } from '@shared/parsers'
import { useAppStore } from '../store/app-store'

const MAX_LOGS = 50000
const ALL_LEVELS = ['V', 'D', 'I', 'W', 'E', 'F']
const LEVEL_OPTIONS = ALL_LEVELS.map((value) => ({ label: value, value }))

interface LogLine {
  id: number
  time: string
  level: string
  tag: string
  pid: string
  message: string
  raw: string
}

interface LogContextMenu {
  x: number
  y: number
  log?: LogLine
  selection: string
}

interface LogFilter {
  levels: Set<string>
  allLevels: boolean
  tags: string[]
  keyword: string
  pids: Set<string>
}

function levelClass(level: string): string {
  switch (level) {
    case 'E':
      return 'log-level-e'
    case 'W':
      return 'log-level-w'
    case 'D':
      return 'log-level-d'
    case 'V':
      return 'log-level-v'
    case 'F':
      return 'log-level-f'
    default:
      return ''
  }
}

function buildFilter(
  levels: string[],
  tag: string,
  keyword: string,
  pidText: string
): LogFilter {
  return {
    levels: new Set(levels),
    allLevels: levels.length === ALL_LEVELS.length,
    tags: tag
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    keyword: keyword.trim().toLowerCase(),
    pids: new Set(
      pidText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }
}

function matchesLog(log: LogLine, filter: LogFilter): boolean {
  if (log.level) {
    if (!filter.levels.has(log.level)) return false
  } else if (!filter.allLevels) {
    return false
  }
  if (filter.tags.length > 0) {
    const tag = log.tag.toLowerCase()
    if (!filter.tags.some((item) => tag.includes(item))) return false
  }
  if (filter.keyword && !log.raw.toLowerCase().includes(filter.keyword)) return false
  if (filter.pids.size > 0 && !filter.pids.has(log.pid)) return false
  return true
}

function highlightMessage(message: string, keyword: string): ReactNode {
  const needle = keyword.trim().toLowerCase()
  if (!needle) return message
  const lower = message.toLowerCase()
  const parts: ReactNode[] = []
  let start = 0
  let index = lower.indexOf(needle)
  let markIndex = 0
  while (index >= 0 && markIndex < 80) {
    if (index > start) parts.push(message.slice(start, index))
    parts.push(<mark key={markIndex}>{message.slice(index, index + needle.length)}</mark>)
    markIndex += 1
    start = index + needle.length
    index = lower.indexOf(needle, start)
  }
  if (start < message.length) parts.push(message.slice(start))
  return parts.length > 0 ? parts : message
}

function makeExportName(scope: 'filtered' | 'all'): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    'log-' +
    (scope === 'filtered' ? 'filtered-' : 'all-') +
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds()) +
    '.txt'
  )
}

export default function LogCenterPage(): ReactElement {
  const { message, modal } = AntdApp.useApp()
  const { state, config } = useAppStore()
  const selectedSerial = state?.selectedSerial ?? null
  const selectedDevice = state?.devices.find((device) => device.serial === selectedSerial)
  const adb = state?.adb
  const canStart = Boolean(
    selectedSerial && selectedDevice?.state === 'device' && adb?.health === 'ready'
  )
  const selectedLabel = selectedDevice
    ? (selectedDevice.model || selectedDevice.serial) + ' · ' + selectedDevice.serial
    : '未选择设备'
  const foregroundPackage = state?.foregroundApp?.packageName ?? ''

  const logsRef = useRef<LogLine[]>([])
  const visibleRef = useRef<LogLine[]>([])
  const nextIdRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const runningRef = useRef(false)
  const captureSerialRef = useRef<string | null>(null)
  const filtersRef = useRef<LogFilter>(buildFilter([...ALL_LEVELS], '', '', ''))
  const resumeRef = useRef(false)
  const deviceReadyRef = useRef(false)
  const deviceLostRef = useRef(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<number | null>(null)
  const reconnectRef = useRef<() => void>(() => undefined)
  const scheduleRetryRef = useRef<(message?: string) => void>(() => undefined)

  const [receivedCount, setReceivedCount] = useState(0)
  const [displayCount, setDisplayCount] = useState(0)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [clearingDevice, setClearingDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [levels, setLevels] = useState<string[]>([...ALL_LEVELS])
  const [tag, setTag] = useState('')
  const [keyword, setKeyword] = useState('')
  const [packageName, setPackageName] = useState('')
  const [pidText, setPidText] = useState('')
  const [resolvingPids, setResolvingPids] = useState(false)
  const [captureAppLoading, setCaptureAppLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered')
  const [exportName, setExportName] = useState('')
  const [exportDir, setExportDir] = useState('')
  const [exporting, setExporting] = useState(false)
  const [contextMenu, setContextMenu] = useState<LogContextMenu | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [crashOpen, setCrashOpen] = useState(false)
  const [crashLoading, setCrashLoading] = useState(false)
  const [crashText, setCrashText] = useState('')
  const [loadedFile, setLoadedFile] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)

  const clearRetryTimer = (): void => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }

  useEffect(() => {
    deviceReadyRef.current = Boolean(
      selectedSerial && selectedDevice?.state === 'device' && adb?.health === 'ready'
    )
  }, [selectedSerial, selectedDevice?.state, adb?.health])

  const virtualizer = useVirtualizer({
    count: displayCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 30
  })

  useEffect(() => {
    const offBatch = window.api.onLogBatch((batch) => {
      const entries = batch.lines.map((raw) => {
        const parsed = parseLogcatLine(raw)
        return { id: nextIdRef.current++, ...parsed, raw }
      })
      logsRef.current.push(...entries)

      for (const entry of entries) {
        if (matchesLog(entry, filtersRef.current)) visibleRef.current.push(entry)
      }

      if (logsRef.current.length > MAX_LOGS) {
        const overflow = logsRef.current.length - MAX_LOGS
        const removed = logsRef.current.splice(0, overflow)
        const lastRemovedId = removed[removed.length - 1]?.id ?? 0
        while (visibleRef.current.length > 0 && visibleRef.current[0].id <= lastRemovedId) {
          visibleRef.current.shift()
        }
      }

      setReceivedCount(logsRef.current.length)
      if (!pausedRef.current) {
        setDisplayCount(visibleRef.current.length)
      }
    })

    const offStatus = window.api.onLogStatus((status) => {
      setRunning(status.running)
      runningRef.current = status.running
      if (!status.running) {
        setStarting(false)
        setStopping(false)
        setPaused(false)
        pausedRef.current = false
        setDisplayCount(visibleRef.current.length)
        if (status.error) {
          if (resumeRef.current && deviceReadyRef.current) {
            scheduleRetryRef.current('日志已断开')
          } else if (resumeRef.current) {
            deviceLostRef.current = true
            setError('设备已断开，等待重连')
          } else {
            setError(status.error)
          }
        }
      }
    })

    return () => {
      offBatch()
      offStatus()
    }
  }, [])

  useEffect(() => {
    if (!autoScroll || paused || displayCount === 0) return
    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(displayCount - 1, { align: 'end' })
    })
    return () => cancelAnimationFrame(frame)
  }, [autoScroll, paused, displayCount, virtualizer])

  useEffect(() => {
    if (!running) return
    const captureSerial = captureSerialRef.current
    if (captureSerial && selectedSerial !== captureSerial) {
      if (!selectedSerial) {
        deviceLostRef.current = true
        setError('设备已断开，等待重连')
      } else {
        resumeRef.current = false
        clearRetryTimer()
        setError('设备已切换，日志已停止')
      }
      void window.api.stopLog().catch(() => undefined)
      setRunning(false)
      runningRef.current = false
      setPaused(false)
      pausedRef.current = false
    }
  }, [selectedSerial, running])

  useEffect(() => {
    if (!deviceLostRef.current || !resumeRef.current || !deviceReadyRef.current) return
    deviceLostRef.current = false
    reconnectRef.current()
  }, [selectedSerial, selectedDevice?.state, adb?.health])

  useEffect(() => {
    return () => {
      resumeRef.current = false
      clearRetryTimer()
      if (runningRef.current) {
        void window.api.stopLog().catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = (): void => setContextMenu(null)
    const onMouseDown = (event: MouseEvent): void => {
      if (contextMenuRef.current?.contains(event.target as Node)) return
      close()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const applyFilters = (
    nextLevels: string[],
    nextTag: string,
    nextKeyword: string,
    nextPidText: string
  ): void => {
    const filter = buildFilter(nextLevels, nextTag, nextKeyword, nextPidText)
    filtersRef.current = filter
    const visible = logsRef.current.filter((log) => matchesLog(log, filter))
    visibleRef.current = visible
    setDisplayCount(visible.length)
  }

  const handleLevelsChange = (values: string[]): void => {
    setLevels(values)
    applyFilters(values, tag, keyword, pidText)
  }

  const handleTagChange = (value: string): void => {
    setTag(value)
    applyFilters(levels, value, keyword, pidText)
  }

  const handleKeywordChange = (value: string): void => {
    setKeyword(value)
    applyFilters(levels, tag, value, pidText)
  }

  const handlePidChange = (value: string): void => {
    setPidText(value)
    applyFilters(levels, tag, keyword, value)
  }

  const handleResetFilters = (): void => {
    setLevels([...ALL_LEVELS])
    setTag('')
    setKeyword('')
    setPackageName('')
    setPidText('')
    applyFilters([...ALL_LEVELS], '', '', '')
  }

  const handleResolvePids = async (): Promise<void> => {
    const name = packageName.trim()
    if (!name) {
      message.warning('请先输入包名')
      return
    }
    setResolvingPids(true)
    try {
      const result = await window.api.resolveLogPids(name)
      if (!result.ok) {
        message.warning(result.message)
        return
      }
      const nextPidText = result.pids.join(',')
      setPidText(nextPidText)
      applyFilters(levels, tag, keyword, nextPidText)
      message.success('找到 PID：' + nextPidText)
    } catch (errorValue) {
      message.error('查 PID 失败：' + String(errorValue))
    } finally {
      setResolvingPids(false)
    }
  }

  const scrollToBottom = (): void => {
    if (displayCount > 0) {
      virtualizer.scrollToIndex(displayCount - 1, { align: 'end' })
    }
  }

  const scheduleRetry = (prefix?: string): void => {
    if (!resumeRef.current || retryTimerRef.current !== null) return
    if (retryCountRef.current >= 3) {
      resumeRef.current = false
      setError('日志多次断开，已停止自动重连')
      return
    }
    const delays = [1000, 2000, 5000]
    const delay = delays[retryCountRef.current] ?? 5000
    retryCountRef.current += 1
    setError((prefix ?? '日志已断开') + '，' + Math.round(delay / 1000) + ' 秒后重试')
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      reconnectRef.current()
    }, delay)
  }

  scheduleRetryRef.current = scheduleRetry

  const reconnectLog = async (): Promise<void> => {
    if (!resumeRef.current) return
    if (!selectedSerial || !deviceReadyRef.current) {
      deviceLostRef.current = true
      setError('设备已断开，等待重连')
      return
    }
    setRetrying(true)
    try {
      let nextPidText = pidText
      if (packageName.trim()) {
        const pidResult = await window.api.resolveLogPids(packageName.trim())
        if (!pidResult.ok || pidResult.pids.length === 0) {
          setError(pidResult.message || '应用未运行，请重新打开应用')
          scheduleRetryRef.current('应用未运行')
          return
        }
        nextPidText = pidResult.pids.join(',')
        setPidText(nextPidText)
        applyFilters(levels, tag, keyword, nextPidText)
      }
      const result = await window.api.startLog()
      if (!result.ok) {
        setError(result.message)
        scheduleRetryRef.current('日志重连失败')
        return
      }
      captureSerialRef.current = selectedSerial
      setRunning(true)
      runningRef.current = true
      setPaused(false)
      pausedRef.current = false
      setAutoScroll(true)
      setError(null)
      retryCountRef.current = 0
      deviceLostRef.current = false
      message.success('日志已重连')
    } catch (errorValue) {
      setError('重连失败：' + String(errorValue))
      scheduleRetryRef.current('日志重连失败')
    } finally {
      setRetrying(false)
    }
  }

  reconnectRef.current = () => {
    void reconnectLog()
  }

  const handleStart = async (): Promise<void> => {
    if (!canStart || !selectedSerial) {
      message.warning('请先选择一台已连接设备')
      return
    }
    clearRetryTimer()
    resumeRef.current = true
    deviceLostRef.current = false
    retryCountRef.current = 0
    setRetrying(false)
    setStarting(true)
    setError(null)
    setLoadedFile(null)
    logsRef.current = []
    visibleRef.current = []
    nextIdRef.current = 1
    setReceivedCount(0)
    setDisplayCount(0)
    setPaused(false)
    pausedRef.current = false
    captureSerialRef.current = selectedSerial

    try {
      const result = await window.api.startLog()
      if (!result.ok) {
        resumeRef.current = false
        message.error(result.message)
        captureSerialRef.current = null
        return
      }
      setRunning(true)
      runningRef.current = true
      setAutoScroll(true)
      setError(null)
      message.success('开始抓取日志')
    } catch (errorValue) {
      message.error('启动日志抓取失败：' + String(errorValue))
      captureSerialRef.current = null
    } finally {
      setStarting(false)
    }
  }

  // 只按 PID 收窄当前前台应用，避免把整机日志都算成应用日志。
  const captureApp = async (name: string): Promise<void> => {
    if (!name) {
      message.warning('请先输入包名')
      return
    }
    setCaptureAppLoading(true)
    try {
      const result = await window.api.resolveLogPids(name)
      if (!result.ok) {
        message.warning(result.message)
        return
      }
      const pids = result.pids.join(',')
      setPidText(pids)
      applyFilters(levels, tag, keyword, pids)
      if (!running) {
        await handleStart()
      } else {
        message.success('已按应用 PID 过滤：' + pids)
      }
    } catch (errorValue) {
      message.error('抓应用日志失败：' + String(errorValue))
    } finally {
      setCaptureAppLoading(false)
    }
  }

  const handleCaptureApp = (): void => {
    void captureApp(packageName.trim())
  }

  const handleCaptureCurrentApp = (): void => {
    if (!foregroundPackage) {
      message.warning('没有识别到当前前台应用，请先在设备上打开目标应用')
      return
    }
    setPackageName(foregroundPackage)
    void captureApp(foregroundPackage)
  }

  const handleCrashLog = async (): Promise<void> => {
    setCrashLoading(true)
    try {
      const result = await window.api.getCrashLog()
      if (!result.ok) {
        message.error(result.message)
        return
      }
      setCrashText(result.text ?? '')
      setCrashOpen(true)
    } catch (errorValue) {
      message.error('读取崩溃日志失败：' + String(errorValue))
    } finally {
      setCrashLoading(false)
    }
  }

  const handleCopyCrash = async (): Promise<void> => {
    try {
      await window.api.copyText(crashText)
      message.success('崩溃日志已复制')
    } catch (errorValue) {
      message.error('复制失败：' + String(errorValue))
    }
  }

  const handleStop = async (): Promise<void> => {
    resumeRef.current = false
    deviceLostRef.current = false
    clearRetryTimer()
    setRetrying(false)
    setError(null)
    setStopping(true)
    try {
      const result = await window.api.stopLog()
      if (!result.ok) message.error(result.message)
    } catch (errorValue) {
      message.error('停止日志抓取失败：' + String(errorValue))
    } finally {
      captureSerialRef.current = null
      setStopping(false)
      setRunning(false)
      runningRef.current = false
      setPaused(false)
      pausedRef.current = false
      setDisplayCount(visibleRef.current.length)
    }
  }

  const handlePause = (): void => {
    if (!running) return
    if (paused) {
      setPaused(false)
      pausedRef.current = false
      setDisplayCount(visibleRef.current.length)
    } else {
      setPaused(true)
      pausedRef.current = true
    }
  }

  const handleClear = (): void => {
    logsRef.current = []
    visibleRef.current = []
    nextIdRef.current = 1
    setReceivedCount(0)
    setDisplayCount(0)
    setError(null)
    setLoadedFile(null)
    virtualizer.scrollToOffset(0)
    void window.api.clearLogHistory().catch(() => undefined)
  }

  const openExport = (scope: 'filtered' | 'all'): void => {
    if (scope === 'filtered' && displayCount === 0) {
      message.warning('当前筛选没有日志')
      return
    }
    if (scope === 'all' && receivedCount === 0) {
      message.warning('没有日志可导出')
      return
    }
    setExportScope(scope)
    setExportName(makeExportName(scope))
    setExportDir(config?.log.saveDir ?? '')
    setExportOpen(true)
  }

  const handlePickExportDir = async (): Promise<void> => {
    const dir = await window.api.pickDirectory()
    if (dir) setExportDir(dir)
  }

  const handleExport = async (): Promise<void> => {
    const name = exportName.trim()
    const dir = exportDir.trim()
    if (!name) {
      message.warning('请填写文件名')
      return
    }
    if (!dir) {
      message.warning('请填写保存目录')
      return
    }
    const lines =
      exportScope === 'filtered'
        ? visibleRef.current.slice(0, displayCount).map((log) => log.raw)
        : logsRef.current.map((log) => log.raw)
    if (lines.length === 0) {
      message.warning('没有日志可导出')
      return
    }
    setExporting(true)
    try {
      const result = await window.api.saveLog({ directory: dir, fileName: name, lines })
      if (result.ok) {
        message.success(
          '已导出 ' + (result.lines ?? 0) + ' 条到 ' + (result.filePath ?? '')
        )
        setExportOpen(false)
      } else {
        message.error(result.message)
      }
    } catch (errorValue) {
      message.error('导出失败：' + String(errorValue))
    } finally {
      setExporting(false)
    }
  }

  const copyText = async (text: string, successMessage: string): Promise<void> => {
    if (!text) return
    try {
      await window.api.copyText(text)
      message.success(successMessage)
    } catch (errorValue) {
      message.error('复制失败：' + String(errorValue))
    }
  }

  const handleLogContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const target = event.target as HTMLElement
    const row = target.closest('.log-row') as HTMLElement | null
    const indexText = row?.getAttribute('data-index')
    const index = indexText !== null && indexText !== undefined ? Number(indexText) : -1
    const log = Number.isInteger(index) && index >= 0 ? visibleRef.current[index] : undefined
    const selection = window.getSelection()?.toString() ?? ''
    setContextMenu({ x: event.clientX, y: event.clientY, log, selection })
  }

  const handleClearDeviceLog = (): void => {
    if (!canStart) {
      message.warning('请先选择一台已连接设备')
      return
    }
    modal.confirm({
      title: '清空手机日志缓冲区？',
      content: '会执行 adb logcat -c，清空手机上的日志缓存，并清空当前显示。',
      okText: '清空',
      okButtonProps: { danger: true },
      onOk: async () => {
        setClearingDevice(true)
        try {
          const result = await window.api.clearDeviceLog()
          if (!result.ok) {
            message.error(result.message)
            return
          }
          handleClear()
          message.success('手机日志缓冲区已清空')
        } catch (errorValue) {
          message.error('清空手机日志失败：' + String(errorValue))
        } finally {
          setClearingDevice(false)
        }
      }
    })
  }

  const handleLoadLog = async (): Promise<void> => {
    if (running) {
      message.warning('先停止抓取，再加载历史日志')
      return
    }
    setLoadingFile(true)
    try {
      const result = await window.api.loadLogFile()
      if (!result) return
      if (!result.ok || !result.lines) {
        message.error(result.message)
        return
      }
      const entries: LogLine[] = []
      nextIdRef.current = 1
      for (const raw of result.lines) {
        const parsed = parseLogcatLine(raw)
        entries.push({ id: nextIdRef.current++, ...parsed, raw })
      }
      logsRef.current = entries
      const visible = entries.filter((log) => matchesLog(log, filtersRef.current))
      visibleRef.current = visible
      setReceivedCount(entries.length)
      setDisplayCount(visible.length)
      setPaused(false)
      pausedRef.current = false
      setRunning(false)
      runningRef.current = false
      captureSerialRef.current = null
      setError(null)
      setLoadedFile(result.filePath ?? null)
      if (result.truncated) {
        message.warning('日志较大，只加载了最近 ' + entries.length + ' 行')
      } else {
        message.success('已加载 ' + entries.length + ' 条日志')
      }
    } catch (errorValue) {
      message.error('加载日志失败：' + String(errorValue))
    } finally {
      setLoadingFile(false)
    }
  }

  const handleCopyLogs = async (): Promise<void> => {
    if (displayCount === 0) {
      message.warning('没有可复制的日志')
      return
    }
    const text = visibleRef.current
      .slice(0, displayCount)
      .map((log) => log.raw)
      .join('\n')
    try {
      await window.api.copyText(text)
      message.success('已复制 ' + displayCount + ' 条日志')
    } catch (errorValue) {
      message.error('复制失败：' + String(errorValue))
    }
  }

  const handleAutoScroll = (checked: boolean): void => {
    setAutoScroll(checked)
    if (checked) {
      requestAnimationFrame(() => scrollToBottom())
    }
  }

  const summaryParts: string[] = []
  if (levels.length !== ALL_LEVELS.length) {
    summaryParts.push('级别 ' + (levels.length > 0 ? levels.join('/') : '无'))
  }
  if (tag.trim()) summaryParts.push('Tag ' + tag.trim())
  if (keyword.trim()) summaryParts.push('关键字 ' + keyword.trim())
  if (pidText.trim()) summaryParts.push('PID ' + pidText.trim())
  const filterSummary = summaryParts.length > 0 ? summaryParts.join(' · ') : '未过滤'
  const loadedFileName = loadedFile
    ? loadedFile.split(/[\\/]/).pop() ?? loadedFile
    : null

  return (
    <div>
      <div className="page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            日志中心
          </Typography.Title>
          <Typography.Text type="secondary">
            实时日志、过滤、崩溃日志、当前应用日志、保存/加载/复制。
          </Typography.Text>
        </div>
      </div>

      {!canStart && !running ? (
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

      {error ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="error"
          showIcon
          closable
          message={error}
          action={
            resumeRef.current && canStart && !running ? (
              <Button size="small" loading={retrying} onClick={() => reconnectRef.current()}>
                立即重试
              </Button>
            ) : undefined
          }
          onClose={() => setError(null)}
        />
      ) : null}

      <Card
        className="page-card"
        title={
          <Space>
            <span>实时日志</span>
            <Tag>{selectedLabel}</Tag>
            {loadedFileName ? <Tag color="gold">文件 {loadedFileName}</Tag> : null}
          </Space>
        }
        extra={
          <Space>
            <Tag color={running ? (paused ? 'warning' : 'processing') : 'default'}>
              {running ? (paused ? '已暂停' : '抓取中') : retrying ? '重连中' : '未抓取'}
            </Tag>
            <Typography.Text type="secondary">
              已接收 {receivedCount} 条 / 显示 {displayCount} 条
            </Typography.Text>
          </Space>
        }
      >
        <Space wrap className="log-toolbar">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={starting}
            disabled={!canStart || running}
            onClick={() => void handleStart()}
          >
            开始抓取
          </Button>
          <Button
            danger
            icon={<StopOutlined />}
            loading={stopping}
            disabled={!running}
            onClick={() => void handleStop()}
          >
            停止
          </Button>
          <Button
            icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            disabled={!running}
            onClick={handlePause}
          >
            {paused ? '继续' : '暂停'}
          </Button>
          <Button
            icon={<ClearOutlined />}
            disabled={receivedCount === 0 && displayCount === 0}
            onClick={handleClear}
          >
            清空显示
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={clearingDevice}
            disabled={!canStart || clearingDevice}
            onClick={handleClearDeviceLog}
          >
            清空手机日志
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'filtered', label: '导出筛选日志' },
                { key: 'all', label: '导出全部日志' }
              ],
              onClick: ({ key }) => openExport(key === 'all' ? 'all' : 'filtered')
            }}
          >
            <Button icon={<SaveOutlined />}>导出</Button>
          </Dropdown>
          <Button
            icon={<FolderOpenOutlined />}
            loading={loadingFile}
            disabled={running || loadingFile}
            onClick={() => void handleLoadLog()}
          >
            加载日志
          </Button>
          <Button
            icon={<CopyOutlined />}
            disabled={displayCount === 0}
            onClick={() => void handleCopyLogs()}
          >
            复制日志
          </Button>
          <Button
            icon={<WarningOutlined />}
            loading={crashLoading}
            disabled={!canStart}
            onClick={() => void handleCrashLog()}
          >
            崩溃日志
          </Button>
          <span className="log-switch">
            <Switch size="small" checked={autoScroll} onChange={handleAutoScroll} />
            自动滚动
          </span>
          <Button
            icon={<VerticalAlignBottomOutlined />}
            disabled={displayCount === 0}
            onClick={scrollToBottom}
          >
            回到底部
          </Button>
        </Space>

        <div className="log-filter-bar">
          <span className="log-filter-label">级别</span>
          <Checkbox.Group
            options={LEVEL_OPTIONS}
            value={levels}
            onChange={(values) => handleLevelsChange(values as string[])}
          />
          <Button size="small" type="link" onClick={handleResetFilters}>
            重置过滤
          </Button>
          <Input
            size="small"
            allowClear
            placeholder="包名"
            value={packageName}
            onChange={(event) => setPackageName(event.target.value)}
            style={{ width: 200 }}
          />
          <Button
            size="small"
            loading={resolvingPids}
            onClick={() => void handleResolvePids()}
          >
            查 PID
          </Button>
          <Button
            size="small"
            type="primary"
            ghost
            loading={captureAppLoading}
            disabled={!canStart || captureAppLoading}
            onClick={handleCaptureApp}
          >
            抓此应用日志
          </Button>
          <Button
            size="small"
            icon={<AimOutlined />}
            loading={captureAppLoading}
            disabled={!canStart || captureAppLoading || !foregroundPackage}
            onClick={handleCaptureCurrentApp}
          >
            抓当前应用
          </Button>
          <Input
            size="small"
            allowClear
            placeholder="PID（逗号分隔）"
            value={pidText}
            onChange={(event) => handlePidChange(event.target.value)}
            style={{ width: 160 }}
          />
          <Input
            size="small"
            allowClear
            placeholder="Tag（逗号分隔）"
            value={tag}
            onChange={(event) => handleTagChange(event.target.value)}
            style={{ width: 180 }}
          />
          <Input
            size="small"
            allowClear
            placeholder="关键字"
            value={keyword}
            onChange={(event) => handleKeywordChange(event.target.value)}
            style={{ width: 200 }}
          />
          <Typography.Text type="secondary" className="log-filter-summary">
            当前过滤：{filterSummary}
          </Typography.Text>
        </div>

        <div className="log-view" ref={scrollRef} onContextMenu={handleLogContextMenu}>
          {displayCount === 0 ? (
            <div className="log-empty">
              {receivedCount > 0
                ? '当前过滤条件下没有日志。'
                : '还没有日志。选设备后点“开始抓取”。'}
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((item) => {
                const log = visibleRef.current[item.index]
                if (!log) return null
                return (
                  <div
                    key={log.id}
                    data-index={item.index}
                    className={'log-row ' + levelClass(log.level)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: item.size,
                      transform: 'translateY(' + item.start + 'px)'
                    }}
                    title={log.raw}
                  >
                    <span className="log-time">{log.time || '—'}</span>
                    <span className="log-level">{log.level || '·'}</span>
                    <span className="log-tag">
                      {log.tag}
                      {log.pid ? ' (' + log.pid + ')' : ''}
                    </span>
                    <span className="log-message">{highlightMessage(log.message, keyword)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="log-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.log ? (
            <div
              className="log-context-item"
              onClick={() => {
                const log = contextMenu.log
                setContextMenu(null)
                if (log) void copyText(log.raw, '已复制此行')
              }}
            >
              复制此行
            </div>
          ) : null}
          {contextMenu.selection.trim() ? (
            <div
              className="log-context-item"
              onClick={() => {
                const text = contextMenu.selection
                setContextMenu(null)
                void copyText(text, '已复制选中文本')
              }}
            >
              复制选中文本
            </div>
          ) : null}
          <div
            className="log-context-item"
            onClick={() => {
              setContextMenu(null)
              void handleCopyLogs()
            }}
          >
            复制全部筛选结果
          </div>
        </div>
      ) : null}

      <Modal
        title="导出日志"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        width={620}
        footer={[
          <Button key="cancel" onClick={() => setExportOpen(false)}>
            取消
          </Button>,
          <Button key="export" type="primary" loading={exporting} onClick={() => void handleExport()}>
            导出
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="导出范围">
            <Radio.Group
              value={exportScope}
              onChange={(event) =>
                setExportScope(event.target.value as 'filtered' | 'all')
              }
            >
              <Radio value="filtered">当前筛选（{displayCount} 条）</Radio>
              <Radio value="all">全部日志（{receivedCount} 条）</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="文件名">
            <Input
              value={exportName}
              onChange={(event) => setExportName(event.target.value)}
              placeholder="log-20261030-213000.txt"
            />
          </Form.Item>
          <Form.Item label="保存目录">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={exportDir}
                onChange={(event) => setExportDir(event.target.value)}
              />
              <Button onClick={() => void handlePickExportDir()}>选择目录</Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="崩溃日志"
        open={crashOpen}
        onCancel={() => setCrashOpen(false)}
        width={900}
        footer={[
          <Button key="copy" disabled={!crashText.trim()} onClick={() => void handleCopyCrash()}>
            复制
          </Button>,
          <Button key="close" type="primary" onClick={() => setCrashOpen(false)}>
            关闭
          </Button>
        ]}
      >
        <pre className="crash-log">{crashText.trim() || '没有崩溃日志'}</pre>
      </Modal>
    </div>
  )
}
