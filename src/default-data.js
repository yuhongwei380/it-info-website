export const defaultDirectory = {
  version: 1,
  groups: [
    {
      id: "company",
      name: "公司信息",
      eyebrow: "ORGANIZATION",
      description: "日常协作、员工服务与内部信息入口",
      cards: [
        { id: "forum", title: "公司论坛", description: "公告、讨论与知识沉淀", links: [{ id: "forum-main", label: "进入论坛", url: "https://example.com/forum" }] },
        { id: "dynamics", title: "Dynamics 365", description: "业务流程与客户信息", links: [{ id: "dynamics-main", label: "打开系统", url: "https://example.com/dynamics" }] },
        { id: "mail", title: "邮件群组信息", description: "查询团队邮件分组", links: [{ id: "mail-main", label: "查询群组", url: "https://example.com/mail" }] },
        { id: "employee", title: "员工系统", description: "假期、薪酬与个人资料", links: [{ id: "employee-main", label: "员工自助", url: "https://example.com/employee" }, { id: "employee-help", label: "使用说明", url: "https://example.com/help" }] },
        { id: "ticket", title: "工单系统", description: "提交和跟踪内部服务请求", links: [{ id: "ticket-main", label: "创建工单", url: "https://example.com/ticket" }] },
        { id: "confluence", title: "Confluence", description: "团队文档与知识库", links: [{ id: "confluence-main", label: "浏览知识库", url: "https://example.com/wiki" }] }
      ]
    },
    {
      id: "development",
      name: "研发环境",
      eyebrow: "ENGINEERING",
      description: "开发、观测、制品和许可证相关工具",
      cards: [
        { id: "dashboard", title: "研发 Dashboard", description: "研发服务运行总览", links: [{ id: "dashboard-main", label: "查看面板", url: "https://example.com/dashboard" }] },
        { id: "explorer", title: "Explorer", description: "数据探索与分析", links: [{ id: "explorer-main", label: "打开 Explorer", url: "https://example.com/explorer" }] },
        { id: "license", title: "License Center", description: "许可证申请、分配与查询", links: [{ id: "license-center", label: "许可证中心", url: "https://example.com/license" }, { id: "license-admin", label: "管理后台", url: "https://example.com/license/admin" }] },
        { id: "grafana", title: "Grafana", description: "指标监控与服务观测", links: [{ id: "grafana-main", label: "查看监控", url: "https://example.com/grafana" }] },
        { id: "kibana", title: "Kibana", description: "日志检索与故障排查", links: [{ id: "kibana-main", label: "检索日志", url: "https://example.com/kibana" }] },
        { id: "minio", title: "MinIO", description: "对象存储与文件管理", links: [{ id: "minio-main", label: "存储控制台", url: "https://example.com/minio" }] },
        { id: "docker", title: "本地镜像仓库", description: "团队容器镜像与制品", links: [{ id: "docker-main", label: "浏览镜像", url: "https://example.com/docker" }] }
      ]
    },
    {
      id: "playground",
      name: "竞技场",
      eyebrow: "PLAYGROUND",
      description: "图技术验证、原型与实验性环境",
      cards: [
        { id: "neo4j", title: "Neo4j", description: "图数据实验环境", links: [{ id: "neo4j-main", label: "进入 Neo4j", url: "https://example.com/neo4j" }] },
        { id: "tigergraph", title: "TigerGraph", description: "图分析与算法验证", links: [{ id: "tiger-main", label: "进入 TigerGraph", url: "https://example.com/tigergraph" }] }
      ]
    },
    {
      id: "process",
      name: "流程管理",
      eyebrow: "OPERATIONS",
      description: "需求、客户问题与业务协作流程",
      cards: [
        { id: "request-community", title: "社区版需求池", description: "社区需求收集与排期", links: [{ id: "request-community-main", label: "查看需求", url: "https://example.com/requests/community" }] },
        { id: "request-enterprise", title: "企业版需求池", description: "企业客户需求与路线图", links: [{ id: "request-enterprise-main", label: "查看需求", url: "https://example.com/requests/enterprise" }] },
        { id: "rfi", title: "SA RFI / RFP", description: "售前问询与方案协作", links: [{ id: "rfi-main", label: "进入协作区", url: "https://example.com/rfi" }] },
        { id: "customer-issue", title: "Customer Issue", description: "客户问题升级与跟踪", links: [{ id: "customer-main", label: "跟踪问题", url: "https://example.com/issues" }] },
        { id: "crm", title: "CRM", description: "客户关系与销售流程", links: [{ id: "crm-main", label: "打开 CRM", url: "https://example.com/crm" }] }
      ]
    }
  ]
};
