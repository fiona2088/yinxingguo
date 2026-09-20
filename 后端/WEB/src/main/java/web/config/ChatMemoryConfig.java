package web.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.InMemoryChatMemory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import web.chat.RedisChatMemory;

@Configuration
public class ChatMemoryConfig {

    @Bean
    public ChatMemory chatMemory(StringRedisTemplate stringRedisTemplate,
                                 ObjectMapper objectMapper,
                                 AppProperties appProperties) {
        String store = appProperties.getChat().getMemoryStore();
        if ("memory".equalsIgnoreCase(store)) {
            return new InMemoryChatMemory();
        }
        return new RedisChatMemory(stringRedisTemplate, objectMapper, appProperties.getChat());
    }
}
