### Review Guidance
完成子任务实现后，根据复杂度决定是否发起 review：
- 对 **关键架构变更** 或 **跨模块修改**，建议发起 spec review
- 对 **代码质量敏感** 的变更，可追加 quality review
- 对 **简单修改**（typo、单行修复），无需 review
Review 不通过时，将反馈传回实现者重新修复，然后再次请求 review。
这个循环由你（lead agent）驱动。
