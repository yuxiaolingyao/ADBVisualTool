import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  Descriptions,
  InputNumber,
  Row,
  Space,
  Tag,
  Typography
} from 'antd'
import {
  CameraOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  StopOutlined,
  VideoCameraOutlined
} from '@ant-design/icons'
import type { MirroringState, RecordingState } from '@shared/types'
import { useAppStore } from '../store/app-store'

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0')
}

export default function CapturePage(): ReactElement {
  const { message } = AntdApp.useApp()
  const { state, config, updateConfig } = useAppStore()
  const [screenshotLoading, setScreenshotLoading] = useState(false)
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null)
  const [recordingState, setRecordingState] = useState<RecordingState>({ recording: false })
  const [startingRecording, setStartingRecording] = useState(false)
  const [stoppingRecording, setStoppingRecording] = useState(false)
  const [mirroringState, setMirroringState] = useState<MirroringState>({ mirroring: false })
  const [startingMirroring, setStartingMirroring] = useState(false)
  const [stoppingMirroring, setStoppingMirroring] = useState(false)
  const [recordMinutes, setRecordMinutes] = useState(60)
  const [recordingLimit, setRecordingLimit] = useState(3600)
  const [now, setNow] = useState(Date.now())

  const adb = state?.adb
  const selectedDevice = state?.devices.find((device) => device.serial === state.selectedSerial)
  const canUse = Boolean(
    adb?.health === 'ready' && selectedDevice?.state === 'device'
  )
  const screenshotDir = config?.capture.screenshotDir ?? ''
  const recordDir = config?.capture.recordDir ?? ''
  const bitRate = config?.capture.bitRate ?? 4000000

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const [next, mirror] = await Promise.all([
          window.api.getRecordingState(),
          window.api.getMirroringState()
        ])
        if (active) {
          setRecordingState(next)
          setMirroringState(mirror)
        }
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

  useEffect(() => {
    if (!recordingState.recording) return
    if (recordingState.serial && state?.selectedSerial !== recordingState.serial) {
      void window.api.stopRecording().catch(() => undefined)
    }
    if (mirroringState.serial && state?.selectedSerial !== mirroringState.serial) {
      void window.api.stopMirroring().catch(() => undefined)
    }
  }, [
    state?.selectedSerial,
    recordingState.recording,
    recordingState.serial,
    mirroringState.mirroring,
    mirroringState.serial
  ])

  const openPath = async (target: string | null | undefined): Promise<void> => {
    if (!target) return
    const result = await window.api.openPath(target)
    if (!result.ok) message.error(result.message)
  }

  const handleScreenshot = async (): Promise<void> => {
    setScreenshotLoading(true)
    try {
      const result = await window.api.takeScreenshot()
      if (result.ok) {
        setLastScreenshot(result.filePath ?? null)
        message.success('截图已保存')
      } else {
        message.error(result.message)
      }
    } catch (errorValue) {
      message.error('截图失败：' + String(errorValue))
    } finally {
      setScreenshotLoading(false)
    }
  }

  const handleStartRecording = async (): Promise<void> => {
    setStartingRecording(true)
    try {
      const requested = Math.max(60, Math.min(3600, Math.round(recordMinutes * 60)))
      const result = await window.api.startRecording(requested)
      if (!result.ok) {
        message.error(result.message)
        return
      }
      setRecordingLimit(requested)
      const next = await window.api.getRecordingState()
      setRecordingState(next)
      message.success('开始录屏')
    } catch (errorValue) {
      message.error('开始录屏失败：' + String(errorValue))
    } finally {
      setStartingRecording(false)
    }
  }

  const handleStopRecording = async (): Promise<void> => {
    setStoppingRecording(true)
    try {
      const result = await window.api.stopRecording()
      if (result.ok) message.success('录屏已保存')
      else message.error(result.message)
      const next = await window.api.getRecordingState()
      setRecordingState(next)
    } catch (errorValue) {
      message.error('停止录屏失败：' + String(errorValue))
    } finally {
      setStoppingRecording(false)
    }
  }

  const handleStartMirroring = async (): Promise<void> => {
    setStartingMirroring(true)
    try {
      const result = await window.api.startMirroring()
      if (!result.ok) {
        message.error(result.message)
        return
      }
      const next = await window.api.getMirroringState()
      setMirroringState(next)
      message.success('投屏窗口已打开')
    } catch (errorValue) {
      message.error('打开投屏失败：' + String(errorValue))
    } finally {
      setStartingMirroring(false)
    }
  }

  const handleStopMirroring = async (): Promise<void> => {
    setStoppingMirroring(true)
    try {
      const result = await window.api.stopMirroring()
      if (result.ok) message.success(result.message)
      else message.error(result.message)
      const next = await window.api.getMirroringState()
      setMirroringState(next)
    } catch (errorValue) {
      message.error('关闭投屏失败：' + String(errorValue))
    } finally {
      setStoppingMirroring(false)
    }
  }

  const chooseScreenshotDir = async (): Promise<void> => {
    const dir = await window.api.pickDirectory()
    if (!dir) return
    await updateConfig({ capture: { screenshotDir: dir } })
    message.success('截图目录已更新')
  }

  const chooseRecordDir = async (): Promise<void> => {
    const dir = await window.api.pickDirectory()
    if (!dir) return
    await updateConfig({ capture: { recordDir: dir } })
    message.success('录屏目录已更新')
  }

  const startedAt = recordingState.startedAt ?? 0
  const elapsed = startedAt > 0 ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
  const remaining = Math.max(0, recordingLimit - elapsed)

  return (
    <div>
      <div className="page-heading">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            截图录屏
          </Typography.Title>
          <Typography.Text type="secondary">
            一键截图、录屏，或打开只读的实时投屏窗口。
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

      {recordingState.error ? (
        <Alert style={{ marginBottom: 12 }} type="error" showIcon message={recordingState.error} />
      ) : null}
      {mirroringState.error ? (
        <Alert style={{ marginBottom: 12 }} type="error" showIcon message={mirroringState.error} />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            className="page-card"
            title={
              <Space>
                <CameraOutlined />
                截图
              </Space>
            }
            extra={lastScreenshot ? <Tag color="success">最近已保存</Tag> : null}
          >
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: 'dir',
                  label: '保存目录',
                  children: (
                    <Typography.Text className="mono" ellipsis={{ tooltip: screenshotDir }}>
                      {screenshotDir || '—'}
                    </Typography.Text>
                  )
                },
                {
                  key: 'last',
                  label: '最后截图',
                  children: (
                    <Typography.Text className="mono" ellipsis={{ tooltip: lastScreenshot ?? '' }}>
                      {lastScreenshot ?? '—'}
                    </Typography.Text>
                  )
                }
              ]}
            />
            <Space wrap className="action-row">
              <Button
                type="primary"
                icon={<CameraOutlined />}
                loading={screenshotLoading}
                disabled={!canUse}
                onClick={() => void handleScreenshot()}
              >
                一键截图
              </Button>
              <Button icon={<FolderOpenOutlined />} onClick={() => void chooseScreenshotDir()}>
                选择目录
              </Button>
              <Button
                icon={<FolderOpenOutlined />}
                disabled={!screenshotDir}
                onClick={() => void openPath(screenshotDir)}
              >
                打开目录
              </Button>
              <Button
                disabled={!lastScreenshot}
                onClick={() => void openPath(lastScreenshot)}
              >
                打开截图
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card
            className="page-card"
            title={
              <Space>
                <VideoCameraOutlined />
                录屏
              </Space>
            }
            extra={
              <Tag color={recordingState.recording ? 'processing' : 'default'}>
                {recordingState.recording ? '录屏中' : '未录屏'}
              </Tag>
            }
          >
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: 'dir',
                  label: '保存目录',
                  children: (
                    <Typography.Text className="mono" ellipsis={{ tooltip: recordDir }}>
                      {recordDir || '—'}
                    </Typography.Text>
                  )
                },
                {
                  key: 'format',
                  label: '参数',
                  children:
                    '码率 ' + Math.round(bitRate / 1000) + ' kbps，本次上限 ' + recordMinutes + ' 分钟'
                },
                {
                  key: 'last',
                  label: '最后录屏',
                  children: (
                    <Typography.Text
                      className="mono"
                      ellipsis={{ tooltip: recordingState.filePath ?? '' }}
                    >
                      {recordingState.filePath ?? '—'}
                    </Typography.Text>
                  )
                }
              ]}
            />
            <Space wrap className="record-duration">
              <Typography.Text>本次时长</Typography.Text>
              <InputNumber
                min={1}
                max={60}
                value={recordMinutes}
                addonAfter="分钟"
                disabled={recordingState.recording}
                onChange={(value) => setRecordMinutes(typeof value === 'number' ? value : 60)}
              />
              <Typography.Text type="secondary">默认 60 分钟，可改短</Typography.Text>
            </Space>
            <div className="record-timer">
              {recordingState.recording
                ? '录屏中 ' + formatDuration(elapsed) + ' / ' + formatDuration(recordingLimit) +
                  '（剩余 ' + formatDuration(remaining) + '）'
                : '未录屏'}
            </div>
            <Space wrap className="action-row">
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={startingRecording}
                disabled={!canUse || recordingState.recording || mirroringState.mirroring}
                onClick={() => void handleStartRecording()}
              >
                开始录屏
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                loading={stoppingRecording}
                disabled={!recordingState.recording}
                onClick={() => void handleStopRecording()}
              >
                停止并保存
              </Button>
              <Button icon={<FolderOpenOutlined />} onClick={() => void chooseRecordDir()}>
                选择目录
              </Button>
              <Button
                icon={<FolderOpenOutlined />}
                disabled={!recordDir}
                onClick={() => void openPath(recordDir)}
              >
                打开目录
              </Button>
              <Button
                disabled={!recordingState.filePath}
                onClick={() => void openPath(recordingState.filePath)}
              >
                打开录屏
              </Button>
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              默认最长 60 分钟，可选 1–60 分钟；到时间会自动停止并保存。
              点“停止并保存”后会正常收尾，可能需要几秒，不会瞬间结束。
              录屏时会打开 scrcpy 预览窗口。
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <Card
        className="page-card"
        style={{ marginTop: 16 }}
        title={
          <Space>
            <DesktopOutlined />
            实时投屏
          </Space>
        }
        extra={
          <Tag color={mirroringState.mirroring ? 'processing' : 'default'}>
            {mirroringState.mirroring ? '投屏中' : '未投屏'}
          </Tag>
        }
      >
        <Descriptions
          size="small"
          column={2}
          items={[
            { key: 'mode', label: '模式', children: '独立窗口，只看不控' },
            { key: 'device', label: '设备', children: mirroringState.serial ?? '当前设备' },
            { key: 'audio', label: '声音', children: '关闭' },
            { key: 'window', label: '窗口', children: '可拖动、缩放，关闭窗口即停止' }
          ]}
        />
        <Space wrap className="action-row">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={startingMirroring}
            disabled={!canUse || mirroringState.mirroring || recordingState.recording}
            onClick={() => void handleStartMirroring()}
          >
            打开投屏
          </Button>
          <Button
            danger
            icon={<StopOutlined />}
            loading={stoppingMirroring}
            disabled={!mirroringState.mirroring}
            onClick={() => void handleStopMirroring()}
          >
            关闭投屏
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          投屏复用 scrcpy 独立窗口，不嵌入页面、不转发鼠标键盘；关闭窗口或点“关闭投屏”结束。
          投屏和录屏同一时间只能开一个。
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
