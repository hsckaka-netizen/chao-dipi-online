# 炒地皮在线版项目记忆索引

> 用途：为新任务提供最小上下文。不要一次读取全部模块文档。
>
> 当前稳定基线：以 `main` 最新发布提交为准。

## 项目定位

- 多人在线网页版炒地皮，支持真人、机器人、观战、账号、历史、统计和钻石奖励。
- 核心牌局规则由服务端判断；统计、账号、历史和奖励属于旁路能力，不得阻塞牌局主流程。
- 线上地址：<https://chao-dipi-online.onrender.com/>。
- `main` 推送后由 Render 自动部署。

## 按需求读取

| 当前需求 | 需要读取 |
| --- | --- |
| 技术结构、部署、缓存、数据边界 | `docs/architecture.md` |
| 发牌、叫庄、炒底、牌型、出牌、结算、称号、机器人 | `docs/gameplay-rules.md` |
| 房间、观战、牌桌 UI、移动端、头像框、牌面边框、特效 | `docs/room-and-ui.md` |
| 账号、历史、排行榜、个人主页、赛季 | `docs/accounts-data-and-statistics.md` |
| 钻石奖励 | `docs/diamond-system-requirement-analysis.md` |
| 钻石商城、皮肤拥有权、商品管理、对局道具 | `docs/shop-and-consumable-items-requirement-analysis.md` |
| 英雄卡、抽卡、养成方案（未来能力） | `docs/card-system-requirement-analysis.md` |
| 测试、Token 控制、任务交接、Git、发布 | `docs/development-workflow.md` |

## 维护规则

- 只读取本次需求命中的文档；跨模块需求再增加对应文档。
- 已确认规则发生变化时，更新对应模块文档，不把完整讨论记录到本索引。
- 临时预览、探索方案和废弃规则保留在专项文档中，不进入默认上下文。
- `docs/statistics-preview-notes.md` 是排行榜早期预览记录，除非追溯历史方案，否则不读取。
