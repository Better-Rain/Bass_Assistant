# Redline Bass Tuner

一个为电贝司直插场景设计的简易调音辅助工具，UI 灵感来自 Focusrite Scarlett Solo 的红色金属壳与黑色面板。

## 功能

- 实时音高检测，适配低频贝斯信号
- 音分偏差指针与目标音显示
- 输入设备切换，适合多声卡环境
- `A4 = 430 ~ 450 Hz` 校准
- 多个调弦预设：4 弦标准、Drop D、5 弦标准、Tenor Bass
- 参考音播放，同时叠加高八度便于辨认
- 信号强度、清晰度和最近锁定音符提示

## 开发运行

```bash
npm install
npm run dev
```

默认开发地址通常是 `http://localhost:5173`。

## 使用建议

- 贝斯接入 `Scarlett Solo` 时，建议使用 `INST` 模式。
- 在系统或浏览器里允许麦克风权限。
- 尽量关闭自动增益、降噪、回声消除。
- 调音时拨单根空弦并维持 1 到 2 秒，检测会更稳定。

## 校验

```bash
npm run lint
npm run build
```
