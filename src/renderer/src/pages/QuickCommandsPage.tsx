import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Tag,
  Typography
} from 'antd'
import {
  AimOutlined,
  CopyOutlined,
  LineChartOutlined
} from '@ant-design/icons'
import type { CommandResult, MonkeyStatus } from '@shared/types'
import { useAppStore } from '../store/app-store'

interface LastCommand {
  label: string
  result: CommandResult
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0')
}

const KEY_BUTTONS: Array<{ key: string; label: string }> = [
  { key: 'back', label: '返回' },
  { key: 'home', label: 'Home' },
  { key: 'recents', label: '最近任务' },
  { key: 'power', label: '电源' },
  { key: 'volume_up', label: '音量 +' },
  { key: 'volume_down', label: '音量 -' },
  { key: 'enter', label: '回车' },
  { key: 'delete', label: '删除' }
]

export default function QuickCommandsPage(): ReactElement {
  const { message, modal } = AntdApp.useApp()
  const { state } = useAppStore()
  const [text, setText] = useState('')
  const [tapX, setTapX] = useState(540)
  const [tapY, setTapY] = useState(1200)
  const [swipeFromX, setSwipeFromX] = useState(540)
  const [swipeFromY, setSwipeFromY] = useState(1500)
  const [swipeToX, setSwipeToX] = useState(540)
  const [swipeToY, setSwipeToY] = useState(500)
  const [swipeDuration, setSwipeDuration] = useState(300)
  const [busy, setBusy] = useState<string | null>(null)
  const [last, setLast] = useState<LastCommand | null>(null)
  const [monkeyPackage, setMonkeyPackage] = useState('')
  const [monkeyCount, setMonkeyCount] = useState(100)
  const [monkeyThrottle, setMonkeyThrottle] = useState(100)
  const [monkeySeed, setMonkeySeed] = useState<number | null>(null)
  const [monkeyState, setMonkeyState] = useState<MonkeyStatus>({ running: false })
  const [monkeyBusy, setMonkeyBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [crashOpen, setCrashOpen] = useState(false)
  const [crashLoading, setCrashLoading] = useState(false)
  const [crashText, setCrashText] = useState('')

  const adb = state?.adb
  const selectedDevice = state?.devices.find((device) => device.serial === state.selectedSerial)
  const canUse = Boolean(adb?.health === 'ready' && selectedDevice?.state === 'device')

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const next = await window.api.getMonkeyState()
        if (active) setMonkeyState(next)
      } catch {
        // 轮询失败不打断页面
      }
    }
    void load()
    const timer = setInterval(() => {
      void load()
      setNow(Date.now())
    }, 1000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const run = async (
    label: string,
    action: () => Promise<CommandResult>
  ): Promise<void> => {
    if (!canUse) {
      message.warning('请先选择一台已连接设备')
      return
    }
    setBusy(label)
    setLast({ label, result: { ok: true, message: '执行中…' } })
    try {
      const result = await action()
      setLast({ label, result })
      if (result.ok) message.success(result.message)
      else message.error(result.message)
    } catch (errorValue) {
      const result: CommandResult = { ok: false, message: String(errorValue) }
      setLast({ label, result })
      message.error('执行失败：' + String(errorValue))
    } finally {
      setBusy(null)
    }
  }

  const foregroundPackage = state?.foregroundApp?.packageName ?? ''
  const runShell = (label: string, command: string): void => {
    void run(label, () => window.api.runShell(command))
  }

  const requireForeground = (label: string, command: (name: string) => string): void => {
    if (!foregroundPackage) {
      message.warning('没有识别到当前前台应用，请先在设备上打开目标应用')
      return
    }
    runShell(label, command(foregroundPackage))
  }

  const inspectCurrentScreen = async (): Promise<CommandResult> => {
    const [windowResult, activityResult] = await Promise.all([
      window.api.runShell('dumpsys window'),
      window.api.runShell('dumpsys activity activities')
    ])
    const windowOutput = windowResult.output ?? ''
    const activityOutput = activityResult.output ?? ''
    const focus = windowOutput.match(/mCurrentFocus=([^\n]+)/)?.[1]?.trim()
    const resumed = activityOutput.match(/mResumedActivity:\s*([^\n]+)/)?.[1]?.trim()
    const lines: string[] = []
    if (focus) lines.push('当前焦点：' + focus)
    if (resumed) lines.push('当前 Activity：' + resumed)
    return {
      ok: windowResult.ok && activityResult.ok,
      message: lines.length > 0 ? '已读取当前界面' : '没有找到当前界面信息',
      output: lines.join('\n') || '请确认设备已解锁并停留在目标应用'
    }
  }

  const tap = (): void => {
    if (![tapX, tapY].every(Number.isFinite)) {
      message.warning('请输入有效坐标')
      return
    }
    runShell('点击坐标', 'input tap ' + tapX + ' ' + tapY)
  }

  const swipe = (): void => {
    if (![swipeFromX, swipeFromY, swipeToX, swipeToY, swipeDuration].every(Number.isFinite)) {
      message.warning('请输入有效的滑动参数')
      return
    }
    runShell(
      '滑动操作',
      'input swipe ' +
        swipeFromX + ' ' + swipeFromY + ' ' + swipeToX + ' ' + swipeToY + ' ' + swipeDuration
    )
  }

  const copyResult = async (): Promise<void> => {
    if (!last) return
    const content = last.result.output || last.result.message
    if (!content) return
    await window.api.copyText(content)
    message.success('结果已复制')
  }

  const openPath = async (target: string | undefined): Promise<void> => {
    if (!target) return
    const result = await window.api.openPath(target)
    if (!result.ok) message.error(result.message)
  }

  const startMonkey = (): void => {
    const name = monkeyPackage.trim()
    if (!name) {
      message.warning('请填写 Monkey 的包名')
      return
    }
    if (monkeyState.running) {
      message.warning('Monkey 正在运行')
      return
    }
    if (!Number.isFinite(monkeyCount) || monkeyCount < 1) {
      message.warning('事件数必须大于 0')
      return
    }
    modal.confirm({
      title: '开始 Monkey 测试？',
      content:
        '将对 ' + name + ' 随机发送 ' + monkeyCount + ' 个事件，' +
        '间隔 ' + monkeyThrottle + 'ms。测试期间设备会自己操作。',
      okText: '开始',
      onOk: async () => {
        setMonkeyBusy(true)
        try {
          const result = await window.api.startMonkey(
            name,
            monkeyCount,
            monkeyThrottle,
            monkeySeed ?? undefined
          )
          if (result.ok) message.success(result.message)
          else message.error(result.message)
          const next = await window.api.getMonkeyState()
          setMonkeyState(next)
        } catch (errorValue) {
          message.error('启动 Monkey 失败：' + String(errorValue))
        } finally {
          setMonkeyBusy(false)
        }
      }
    })
  }

  const stopMonkey = async (): Promise<void> => {
    setMonkeyBusy(true)
    try {
      const result = await window.api.stopMonkey()
      if (result.ok) message.success(result.message)
      else message.error(result.message)
      const next = await window.api.getMonkeyState()
      setMonkeyState(next)
    } catch (errorValue) {
      message.error('停止 Monkey 失败：' + String(errorValue))
    } finally {
      setMonkeyBusy(false)
    }
  }

  const showCrashLog = async (): Promise<void> => {
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

  const monkeyElapsed =
    monkeyState.startedAt && monkeyState.running
      ? Math.max(0, Math.floor((now - monkeyState.startedAt) / 1000))
      : 0

  return (
    <div className="tool-page">
      <div className="page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            测试工具
          </Typography.Title>
          <Typography.Text type="secondary">
            Monkey、设备诊断、界面操作；已有功能不重复。
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

      <Row gutter={[16, 16]} className="tool-layout">
        <Col xs={24} lg={12} className="tool-left">
        <Col xs={24} lg={12}>
          <Card
            className="page-card"
            title="设备诊断"
            extra={<Tag color={foregroundPackage ? 'blue' : 'default'}>{foregroundPackage || '无前台应用'}</Tag>}
          >
            <Space wrap>
              <Button
                icon={<LineChartOutlined />}
                loading={busy === '当前界面'}
                disabled={busy !== null}
                onClick={() => void run('当前界面', inspectCurrentScreen)}
              >
                当前界面
              </Button>
              <Button
                loading={busy === '电池状态'}
                disabled={busy !== null}
                onClick={() => runShell('电池状态', 'dumpsys battery')}
              >
                电池
              </Button>
              <Button
                loading={busy === '内存状态'}
                disabled={busy !== null || !foregroundPackage}
                onClick={() => requireForeground('内存状态', (name) => 'dumpsys meminfo ' + name)}
              >
                内存
              </Button>
              <Button
                loading={busy === 'CPU 状态'}
                disabled={busy !== null}
                onClick={() => runShell('CPU 状态', 'dumpsys cpuinfo')}
              >
                CPU
              </Button>
              <Button
                loading={busy === '帧率状态'}
                disabled={busy !== null || !foregroundPackage}
                onClick={() => requireForeground('帧率状态', (name) => 'dumpsys gfxinfo ' + name + ' framestats')}
              >
                帧率
              </Button>
              <Button
                loading={busy === '温度状态'}
                disabled={busy !== null}
                onClick={() => runShell('温度状态', 'dumpsys thermalservice')}
              >
                温度
              </Button>
              <Button
                loading={busy === '分辨率/密度'}
                disabled={busy !== null}
                onClick={() => runShell('分辨率/密度', 'wm size; wm density')}
              >
                分辨率/密度
              </Button>
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              内存和帧率针对当前前台应用。应用启停、安装卸载请到“应用管理”，日志请到“日志中心”。
            </Typography.Paragraph>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card className="page-card" title="常用按键">
            <Space wrap>
              {KEY_BUTTONS.map((item) => (
                <Button
                  key={item.key}
                  loading={busy === '按键 ' + item.label}
                  disabled={busy !== null}
                  onClick={() =>
                    void run('按键 ' + item.label, () => window.api.sendKeyEvent(item.key))
                  }
                >
                  {item.label}
                </Button>
              ))}
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              按键发到当前设备，不依赖当前窗口焦点。
            </Typography.Paragraph>
          </Card>
        </Col>

        <Col xs={24}>
          <Card className="page-card" title="界面操作">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Space wrap>
                <InputNumber
                  min={0}
                  value={tapX}
                  onChange={(value) => setTapX(typeof value === 'number' ? value : 0)}
                  addonBefore="X"
                  style={{ width: 140 }}
                />
                <InputNumber
                  min={0}
                  value={tapY}
                  onChange={(value) => setTapY(typeof value === 'number' ? value : 0)}
                  addonBefore="Y"
                  style={{ width: 140 }}
                />
                <Button
                  icon={<AimOutlined />}
                  loading={busy === '点击坐标'}
                  disabled={busy !== null}
                  onClick={tap}
                >
                  点击坐标
                </Button>
              </Space>
              <Space wrap>
                <InputNumber
                  min={0}
                  value={swipeFromX}
                  onChange={(value) => setSwipeFromX(typeof value === 'number' ? value : 0)}
                  addonBefore="起点 X"
                  style={{ width: 150 }}
                />
                <InputNumber
                  min={0}
                  value={swipeFromY}
                  onChange={(value) => setSwipeFromY(typeof value === 'number' ? value : 0)}
                  addonBefore="起点 Y"
                  style={{ width: 150 }}
                />
                <InputNumber
                  min={0}
                  value={swipeToX}
                  onChange={(value) => setSwipeToX(typeof value === 'number' ? value : 0)}
                  addonBefore="终点 X"
                  style={{ width: 150 }}
                />
                <InputNumber
                  min={0}
                  value={swipeToY}
                  onChange={(value) => setSwipeToY(typeof value === 'number' ? value : 0)}
                  addonBefore="终点 Y"
                  style={{ width: 150 }}
                />
                <InputNumber
                  min={50}
                  max={5000}
                  value={swipeDuration}
                  onChange={(value) => setSwipeDuration(typeof value === 'number' ? value : 300)}
                  addonBefore="时长"
                  addonAfter="ms"
                  style={{ width: 170 }}
                />
                <Button
                  icon={<AimOutlined />}
                  loading={busy === '滑动操作'}
                  disabled={busy !== null}
                  onClick={swipe}
                >
                  滑动
                </Button>
              </Space>
              <Typography.Text type="secondary">
                点击和滑动只作用于当前设备界面。坐标可以先点“当前界面”查看焦点，或在开发者选项里打开指针位置。
              </Typography.Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24}>
          <Card
            className="page-card"
            title="Monkey 测试"
            extra={
              <Tag color={monkeyState.running ? 'processing' : 'default'}>
                {monkeyState.running ? '运行中' : '未运行'}
              </Tag>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Space wrap>
                <Input
                  value={monkeyPackage}
                  onChange={(event) => setMonkeyPackage(event.target.value)}
                  placeholder="包名，例如 com.example.app"
                  style={{ width: 260 }}
                  disabled={monkeyState.running}
                />
                <InputNumber
                  min={1}
                  max={100000}
                  value={monkeyCount}
                  onChange={(value) => setMonkeyCount(typeof value === 'number' ? value : 0)}
                  addonBefore="事件数"
                  style={{ width: 160 }}
                  disabled={monkeyState.running}
                />
                <InputNumber
                  min={0}
                  max={2000}
                  value={monkeyThrottle}
                  onChange={(value) => setMonkeyThrottle(typeof value === 'number' ? value : 0)}
                  addonBefore="间隔"
                  addonAfter="ms"
                  style={{ width: 180 }}
                  disabled={monkeyState.running}
                />
                <InputNumber
                  min={0}
                  value={monkeySeed}
                  onChange={(value) => setMonkeySeed(typeof value === 'number' ? value : null)}
                  placeholder="随机"
                  addonBefore="Seed"
                  style={{ width: 160 }}
                  disabled={monkeyState.running}
                />
              </Space>
              <Space wrap>
                <Button
                  type="primary"
                  loading={monkeyBusy && !monkeyState.running}
                  disabled={!canUse || monkeyState.running || monkeyBusy}
                  onClick={startMonkey}
                >
                  开始 Monkey
                </Button>
                <Button
                  danger
                  loading={monkeyBusy && monkeyState.running}
                  disabled={!monkeyState.running || monkeyBusy}
                  onClick={() => void stopMonkey()}
                >
                  停止 Monkey
                </Button>
                <Button loading={crashLoading} disabled={!canUse} onClick={() => void showCrashLog()}>
                  查看崩溃日志
                </Button>
                <Button
                  disabled={!monkeyState.reportPath}
                  onClick={() => void openPath(monkeyState.reportPath)}
                >
                  打开报告
                </Button>
                <Button
                  disabled={!monkeyState.logPath}
                  onClick={() => void openPath(monkeyState.logPath)}
                >
                  打开 Logcat
                </Button>
                <Button
                  disabled={!monkeyState.crashPath}
                  onClick={() => void openPath(monkeyState.crashPath)}
                >
                  打开崩溃文件
                </Button>
              </Space>
              <Typography.Text type="secondary">
                {monkeyState.running
                  ? '运行中 ' + formatDuration(monkeyElapsed) + '，事件数 ' + String(monkeyState.count ?? '') +
                    '。点“停止 Monkey”会发送中断并等待收尾。'
                  : 'Monkey 会随机操作当前设备，请先确认包名；结束后自动保存报告、logcat 和崩溃日志。'}
              </Typography.Text>
              {monkeyState.error ? (
                <Alert type="error" showIcon message={monkeyState.error} />
              ) : null}
              {monkeyState.reportPath ? (
                <Typography.Text className="mono" ellipsis={{ tooltip: monkeyState.reportPath }}>
                  报告：{monkeyState.reportPath}
                </Typography.Text>
              ) : null}
              {monkeyState.logPath ? (
                <Typography.Text className="mono" ellipsis={{ tooltip: monkeyState.logPath }}>
                  Logcat：{monkeyState.logPath}
                </Typography.Text>
              ) : null}
              {monkeyState.crashPath ? (
                <Typography.Text className="mono" ellipsis={{ tooltip: monkeyState.crashPath }}>
                  崩溃日志：{monkeyState.crashPath}
                </Typography.Text>
              ) : null}
              <pre className="command-output">
                {monkeyState.output || '等待 Monkey 输出…'}
              </pre>
            </Space>
          </Card>
        </Col>

        <Col xs={24}>
          <Card className="page-card" title="输入文本">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="输入英文、数字、空格和 . _ @ : -"
                onPressEnter={() => {
                  if (text.trim()) void run('输入文本', () => window.api.inputText(text))
                }}
              />
              <Button
                type="primary"
                loading={busy === '输入文本'}
                disabled={busy !== null || !text.trim()}
                onClick={() => void run('输入文本', () => window.api.inputText(text))}
              >
                发送文本
              </Button>
            </Space.Compact>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              目前只支持 ASCII 文本；中文输入需要额外输入法组件，暂不支持。
            </Typography.Paragraph>
          </Card>
        </Col>

        </Col>

        <Col xs={24} lg={12} className="tool-result-col">
          <Card
            className="page-card"
            title="执行结果"
            extra={
              last ? (
                <Tag color={last.result.ok ? 'success' : 'error'}>
                  {last.result.ok ? '成功' : '失败'}
                </Tag>
              ) : null
            }
          >
            {last ? (
              <div className="tool-result-content">
                <Typography.Text strong>{last.label}</Typography.Text>
                {last.result.command ? (
                  <Typography.Text code copyable={{ text: last.result.command }}>
                    {last.result.command}
                  </Typography.Text>
                ) : null}
                <Typography.Text type={last.result.ok ? 'success' : 'danger'}>
                  {last.result.message}
                </Typography.Text>
                <pre className="command-output tool-result-output">
                  {last.result.output || '（无额外输出）'}
                </pre>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  disabled={!last.result.output && !last.result.message}
                  onClick={() => void copyResult()}
                >
                  复制结果
                </Button>
              </div>
            ) : (
              <Typography.Text type="secondary">执行一条指令后，这里显示命令和结果。</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="崩溃日志"
        open={crashOpen}
        onCancel={() => setCrashOpen(false)}
        width={900}
        footer={[
          <Button
            key="copy"
            disabled={!crashText.trim()}
            onClick={async () => {
              await window.api.copyText(crashText)
              message.success('崩溃日志已复制')
            }}
          >
            复制
          </Button>,
          <Button key="close" type="primary" onClick={() => setCrashOpen(false)}>
            关闭
          </Button>
        ]}
      >
        <pre className="command-output">{crashText.trim() || '没有崩溃日志'}</pre>
      </Modal>
    </div>
  )
}
