# ADB 工具箱 / ADBVisualTool

面向 Android 手工测试的 Windows 桌面 ADB 工具箱。把设备连接、日志、截图录屏、Monkey、应用管理、文件管理、终端和设置整合到一个界面，减少在多个命令行窗口之间切换。

- 仓库：https://github.com/yuxiaolingyao/ADBVisualTool
- 下载：https://github.com/yuxiaolingyao/ADBVisualTool/releases
- 当前版本：v0.1.0

## 功能

### 设备与 ADB 环境

- 自动检测、手动选择 adb.exe
- ADB Server 启动、停止、重启
- USB 设备列表、序列号、型号、产品、状态
- 品牌、Android 版本、SDK、传输 ID
- 未授权、离线、无权限提示

### 日志中心

- 实时 logcat
- 级别、Tag、关键字过滤
- 按包名解析 PID，只看指定应用
- 一键抓当前应用日志
- 崩溃日志与 crash buffer
- 日志保存、加载历史、复制、导出
- 日志断线等待、自动重连、重连后重新解析 PID

### 截图、录屏、投屏

- 一键截图并拉取到电脑
- 基于 scrcpy 的录屏，支持 1–60 分钟上限
- 录屏自动保存 MP4
- 独立窗口实时投屏，只看不控，不嵌入页面
- 投屏和录屏互斥

### Monkey

- 指定包名、事件数、间隔、随机种子
- 一键开始、停止
- 自动保存报告、logcat、崩溃日志
- 可直接打开报告和日志

### 应用管理

- 用户应用、系统应用列表和搜索
- 版本、APK 路径、数据目录、启动 Activity、权限
- 启动、强制停止、清数据、卸载
- APK 安装
- 冷启动耗时统计

### 文件管理

- 手机目录浏览、路径跳转、上一级、筛选
- 上传、下载、传输进度
- 新建目录、重命名、删除
- 只允许修改 /sdcard 和 /storage/emulated/0，系统目录只读
- 单击选中，双击进入目录

### 终端

- 任意 adb shell 命令
- 输出实时推送
- 命令历史、模板只填入不自动执行
- 强制终止当前 adb shell
- 危险命令二次确认
- 单条输出上限约 400 KB

### 测试工具

- 当前界面、Activity、电池、内存、CPU、帧率、温度、分辨率/密度
- 点击坐标、滑动、按键、文本输入
- Monkey 专项入口
- 左侧功能，右侧常驻结果，页面不整体滚动

### 设置与托盘

- ADB 路径、自动检测
- 日志、截图、录屏、Monkey 输出目录
- 版本信息、Electron/Chrome/Node/ADB 版本
- 一键整体检查
- 托盘显示/隐藏、刷新设备、打开日志目录、退出
- 关闭窗口隐藏到托盘

## 运行环境

- Windows 10 1809+ 或 Windows 11 x64
- 本机安装 Android platform-tools
- 录屏和投屏需要 scrcpy，安装包已内置
- 开发环境 Node.js 20+、pnpm 10/11

## 安装

从 Releases 下载：

    ADBVisualTool Setup 0.1.0.exe

默认安装目录：

    %LOCALAPPDATA%\Programs\ADBVisualTool

便携版：

    ADBVisualTool 0.1.0.exe

便携版会自解压到临时目录，配置仍写入 %APPDATA%\ADB工具箱。

重要：Electron 45 打包版不要在中文目录下直接启动。安装包和便携版请放在英文路径。
安装包没有代码签名，Windows SmartScreen 可能提示未知发布者。

## 首次使用

1. 启动程序
2. 在“设备与设置”确认 adb.exe
3. 手机打开开发者选项和 USB 调试
4. 连接设备并授权
5. 顶部选择设备
6. 进入日志、应用、文件、截图录屏等页面

程序不内置 adb，找不到时手动选择 platform-tools\adb.exe。

## 配置与数据

| 内容 | 路径 |
|---|---|
| 配置 | %APPDATA%\ADB工具箱\config.json |
| 配置备份 | %APPDATA%\ADB工具箱\config.json.bak |
| 默认日志 | 文档\ADB工具箱\logs |
| 默认截图 | 文档\ADB工具箱\screenshots |
| 默认录屏 | 文档\ADB工具箱\records |
| 默认 Monkey | 文档\ADB工具箱\monkey |

配置采用固定临时文件加原子替换，保留上一份有效备份，启动和保存前清理残留临时文件。

## 开发

    pnpm install
    pnpm dev

构建和测试：

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm dist:win

技术栈：Electron 45、electron-vite、Vite 7、React 18、TypeScript 5、Ant Design 5、Zustand、Zod、scrcpy。

## 项目结构

    src/
      main/        Electron 主进程、ADB 服务、窗口、托盘、IPC
      preload/     contextBridge API
      renderer/    React 页面和状态
      shared/      共享类型、API、解析器
    tests/         单元测试、ADB 集成测试、手工 E2E
    resources/     应用图标
    vendor/        scrcpy
    build/         Windows 打包图标

## 已知限制

- 打包版基于 Electron 45，中文目录下可能启动崩溃，请使用英文路径。
- 未做代码签名，SmartScreen 可能拦截。
- 不内置 adb，需要 platform-tools。
- 投屏为独立 scrcpy 窗口，不支持应用内嵌控制。
- 终端强制终止会结束当前 adb shell，设备端已拉起的任务不保证继续。
- 某些厂商 USB/ADB 链路不稳定时日志可能中断；程序会提示并重连，但无法修复 USB 链路。

## 安全

- 渲染进程开启 contextIsolation，关闭 nodeIntegration，使用 preload 暴露有限 API。
- 文件修改限制在用户存储目录。
- 终端会执行任意 adb shell 命令，请只在可信设备上使用。
- 程序不联网、不上传数据。

## License

MIT，见 LICENSE。
