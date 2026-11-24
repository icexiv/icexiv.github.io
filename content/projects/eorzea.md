@!(title: "Eorzea", template: "project")

#import "../components/media.not" as media;

Windows 原生启动，Linux / macOS 通过 Wine 运行。集成 Dalamud，多帐号支持。

- Windows / Linux / macOS
- Dalamud 插件框架
- 多帐号支持

### 命令行工具

也可以使用独立的 CLI：`eoz`。已安装 Rust 工具链时，可从 Git 源码安装，无需编译 App；首次安装需要编译时间及对应平台的构建依赖。

```sh
cargo install --git https://github.com/icexiv/eorzea --locked eorzea-cli
```

安装后运行 `eoz --help` 查看用法。此方式跟随仓库默认分支，不代表正式版。

#media.screenshot[
![Eorzea 实际启动器完整窗口的原生 2 倍像素密度截图：游戏与 Dalamud 已配置；仅账号、游戏路径和日志文字使用骨架短条遮盖，保留下拉框、设置按钮和完整日志区域](../assets/eorzea-screenshot-skeleton-hidpi.png)
]
