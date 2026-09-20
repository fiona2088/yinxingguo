package web.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 业务相关配置（不含 spring.datasource 等，那些仍在 spring.* 下用环境变量注入）。
 */
@Data
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /** 对外访问本服务的根 URL，用于拼 Excel 下载链接等 */
    private String publicBaseUrl = "http://localhost:8080";

    private String internalApiKey;

    private Cache cache = new Cache();
    private Jwt jwt = new Jwt();
    private Predict predict = new Predict();
    private Rag rag = new Rag();
    private Excel excel = new Excel();
    private Mcp mcp = new Mcp();
    private Chat chat = new Chat();

    @Data
    public static class Chat {
        /** redis（推荐，多用户/多实例）或 memory（仅单机调试） */
        private String memoryStore = "redis";
        private long conversationTtlHours = 24;
        /** Redis 中每个会话最多保留的消息条数 */
        private int maxStoredMessages = 100;
        /** 注入模型的最近 N 轮上下文 */
        private int advisorMessageWindow = 20;
    }

    @Data
    public static class Cache {
        private long databaseListTtlMinutes = 30;
        private int ttlJitterSecondsMax = 600;
        private long lockWaitMillis = 100;
        private long lockTtlSeconds = 10;
    }

    @Data
    public static class Jwt {
        private String secret;
        private long expirationHours = 24;
    }

    @Data
    public static class Predict {
        private String serviceUrl = "http://127.0.0.1:9000/predict";
    }

    @Data
    public static class Rag {
        private String chatCompletionsUrl;
    }

    @Data
    public static class Excel {
        /** 可选：本地样例 xlsx 所在目录，为空则禁用固定样例下载接口 */
        private String legacySampleDir = "";
        private String legacySampleFileName = "2024-01-E_total";
    }

    @Data
    public static class Mcp {
        private String serverUrl = "http://localhost:8081";
    }

    public String excelDownloadUrl(String excelName) {
        String base = publicBaseUrl == null ? "" : publicBaseUrl.replaceAll("/$", "");
        return base + "/excel/download/" + excelName;
    }
}
