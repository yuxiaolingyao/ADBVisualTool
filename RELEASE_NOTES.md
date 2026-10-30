# ADBVisualTool v0.1.0

Windows 桌面可视化 ADB 工具箱，面向 Android 手工测试。

## 下载

- ADBVisualTool Setup 0.1.0.exe：NSIS 安装包
- ADBVisualTool 0.1.0.exe：便携版

## 主要功能

- 设备识别、ADB 路径配置、Server 启停
- 实时 logcat、级别、Tag、关键字、PID 过滤
- 当前应用日志、崩溃日志、日志保存、加载、导出
- 日志断线与自动重连
- 截图、scrcpy 录屏、独立窗口实时投屏
- Monkey 测试，自动保存报告、logcat、崩溃文件
- 应用列表、详情、安装、卸载、启停、清数据
- 冷启动耗时统计
- 文件浏览、上传、下载、新建、重命名、删除
- 终端实时输出、历史、模板、强制终止、危险命令确认
- 设备诊断、点击、滑动、按键、文本输入
- 配置、保存目录、版本信息、整体检查
- 系统托盘和右键菜单

## 安装

1. 将安装包放到英文路径。
2. 双击安装。
3. 默认安装到 %LOCALAPPDATA%\Programs\ADBVisualTool。
4. 安装后从开始菜单或桌面快捷方式启动。

便携版同样需要放在英文路径运行。

## 重要兼容性说明

Electron 45 打包版在中文目录下直接启动可能崩溃。发布包使用英文安装目录，请勿把安装包或便携版放到中文文件夹中运行。

安装包没有代码签名，Windows SmartScreen 可能提示未知发布者。

## 数据与配置

- 配置：%APPDATA%\ADB工具箱\config.json
- 备份：%APPDATA%\ADB工具箱\config.json.bak
- 日志：文档\ADB工具箱\logs
- 截图：文档\ADB工具箱\screenshots
- 录屏：文档\ADB工具箱\records
- Monkey：文档\ADB工具箱\monkey

配置采用原子写入并保留上一份有效备份，正常重启不会重置。

## 其他限制

- 不内置 adb，需要本机 platform-tools。
- 投屏是独立 scrcpy 窗口，不支持应用内嵌控制。
- 终端强制终止会结束当前 adb shell。
- 某些厂商 USB/ADB 链路不稳定时日志可能中断；程序会提示并重连，但无法修复 USB 问题。

## 校验

发布资产旁会提供 SHA256；GitHub 也会显示资产 digest。