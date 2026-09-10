# 成就、称号与牌桌 HUD 竞品分析

## Overview

本次对标聚焦两个问题：“长期进度如何转化为可展示身份”，以及“对局中如何减少非决策信息对核心牌面的干扰”。主要参考《英雄联盟》Challenges 的成就—称号结构、《炉石传说》Achievements/Reward Track 的集中进度入口，再用通用 HUD 可读性原则校验牌桌信息层级。

## 功能对比矩阵

| 对标 | 进度组织 | 奖励/展示 | 对局内策略 | 对本项目的启发 |
| --- | --- | --- | --- | --- |
| 英雄联盟 Challenges | 按大类和阶段管理长期目标 | 称号与 Token 分离；已解锁称号可自由装备，并出现在大厅、名片或载入场景 | 详情通过悬停/打开查看，常驻区只保留身份展示 | 成就奖励与装备称号解耦；同时只装备一个，牌桌只显示紧凑标签 |
| 炉石传说 Achievements | 成就、任务、生涯资料集中在 Journal/Profile | 成就提供长期收集与奖励反馈 | 对局内不展开完整进度列表 | 成就页作为独立生涯中心，牌桌只回显已选身份 |
| FFXIV Achievements | 按内容类别划分，目标与奖励可查询 | 部分成就直接奖励称号 | 称号是角色名称的附属展示，不改变战斗属性 | 称号保持纯展示，不与积分或胜负效果绑定 |
| 通用竞技 HUD 原则 | 按决策频率和紧急度排列 | 次要数据收入详情层 | 优先保证核心操作、状态反馈和视觉一致性 | 移除座位剩余牌数；英雄星级收入点击详情；称号限宽、昵称省略 |

参考：[Riot Challenges Walkthrough](https://www.leagueoflegends.com/en-au/news/game-updates/challenges-walkthrough/)、[Riot Challenges Approach](https://www.leagueoflegends.com/en-us/news/dev/quick-gameplay-thoughts-4-8-challenges-approach/)、[Hearthstone Progression Revamp](https://hearthstone.blizzard.com/en-us/news/23534414)、[FFXIV Achievement Database](https://na.finalfantasyxiv.com/lodestone/playguide/db/achievement/?category2=3)、[HUD Design Principles](https://gamedesign.gg/articles/hud-design-principles/)、[Accessible HUD Guidance](https://accessiblegamedesign.com/guidelines/HUD.html)。

## 案例拆解

### 英雄联盟：将“完成”与“想展示什么”分开

Challenges 允许玩家完成多个目标，但只选择少量 Token 和一个称号对外展示。这避免了把全部成就堆到大厅或对局界面。对本项目最直接的应用是：成就页保留完整收集与进度，牌桌仅展示当前装备称号，且与昵称分为两个可独立截断的元素。

### 炉石传说：集中管理长期进度

炉石将 Achievements、Quests 和 Profile 放入集中进度入口，而对局界面继续服务于打牌。本项目因此不在牌局中常驻成就进度或弹出多层奖励信息；成就、称号和体力购买统一收口到首页的“成就”模块，PVE 准备页只补充本次开局必需的体力判定。

## SWOT

| 类别 | 结论 |
| --- | --- |
| Strengths | 现有牌局历史已包含胜负、身份、拖五、保底和表现称号，首期成就可直接基于服务端事实计算。 |
| Weaknesses | “牌局表现称号”与“可装备生涯称号”名称相近，需在文案和样式上持续区分。 |
| Opportunities | 可通过阶梯里程碑、隐藏成就和赛季组拓展长期目标，无需改变核心牌局。 |
| Threats | 可反复刷取的负向指标、PVE 无体力目标和过高钻石奖励可能破坏经济；称号过长则会损害移动牌桌可读性。 |

## 结论与建议

1. 首期使用 8 个 PVP/PVE 独立分组、共 100 项成就，两种模式的长线征途、高光数据、极限挑战和称号收藏分别计算；最高里程碑延长到单一模式 2000 局、1000 胜、500 次炒底和 50000 牌分。
2. 奖励分为钻石、称号、组合奖励；可刻意承受的负向极限目标只给纪念称号，不给钻石。
3. 成就列表展示目标、进度、奖励和领取状态；装备区只展示已领取称号，同时只装备一个。
4. 牌桌信息优先级为：身份/当前操作 > 昵称/称号 > 有效表现 > 英雄。剩余牌数移除，英雄星级收入点击详情。
5. 称号始终使用独立标签、最大宽度和省略；不把称号直接拼到昵称字符串，避免长昵称在侧边座位和移动端破坏布局。
