package mcp;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app")
public class McpAppProperties {
    private String webBaseUrl = "http://localhost:8080";
    private String internalApiKey;
}
