# 小红书宣传配图

这里是一套可直接用于小红书笔记的竖版配图，尺寸为 `1080x1440`。

推荐发图顺序：

1. `01-cover.png`：封面，主打“我咋又刷起来了？”
2. `02-problem.png`：痛点，想工作但手已经打开信息流
3. `03-checkpoint.png`：核心功能，弹窗问“我为什么打开这个网站？”
4. `04-input-compare.png`：交互对比，短答案不能提交，真实目的可以提交
5. `05-settings.png`：设置页，演示模式 / 提醒延迟 / 最少字数
6. `06-history.png`：历史记录，展示可反思的本地记录
7. `07-install.png`：GitHub 和安装方式

源文件生成脚本：

```bash
python3 scripts/generate_social_assets.py
```

如果要改文案或颜色，编辑 `scripts/generate_social_assets.py` 后重新运行即可。
