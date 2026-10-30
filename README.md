# ADB 工具箱

Windows 桌面端可视化 ADB 工具，面向 Android 手工测试。

## 功能

- 设备识别、ADB 路径配置、Server 启停
- 实时 logcat、级别/Tag/关键字/PID 过滤、崩溃日志、当前应用日志
- 截图、scrcpy 录屏
- Monkey 测试与报告
- 应用列表、详情、安装/卸载/启停/清数据
- 文件浏览、上传/下载、新建/重命名/删除
- 终端、实时输出、命令历史、模板、强制终止、危险命令确认
- 独立窗口实时投屏（只看不控）
- 设置、保存目录、版本信息、整体检查
- 托盘图标与右键菜单

## 环境

- Windows 10 1809+ / Windows 11 x64
- Node.js 20+，pnpm 10/11
- Android platform-tools（adb.exe）
- 录屏功能需要 vendor/scrcpy

## 运行

```bash
pnpm install
pnpm dev
```

首次启动会自动查找 ADB；找不到时在“设置”里选择 platform-tools/adb.exe。

## 构建与测试

```bash
pnpm typecheck
pnpm test
pnpm build
```

已生成 Windows 安装包和便携版，详见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。

注意：Electron 45 打包版不要在中文目录下直接运行，安装包/便携版请放英文路径。

## 目录

- 配置：`%APPDATA%\ADB工具箱\config.json`
- 默认日志：`文档\ADB工具箱\logs`
- 默认截图：`文档\ADB工具箱\screenshots`
- 默认录屏：`文档\ADB工具箱\records`
- 默认 Monkey 输出：`文档\ADB工具箱\monkey`

全部可在设置中修改，程序不联网、不上传数据。