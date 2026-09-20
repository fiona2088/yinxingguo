package web.chat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.util.StringUtils;
import web.config.AppProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 按 conversationId 隔离的 Redis 对话记忆，支持多用户并发与多实例部署。
 */
@Slf4j
public class RedisChatMemory implements ChatMemory {

    private static final String KEY_PREFIX = "a08:chat:";

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final long ttlHours;
    private final int maxStoredMessages;

    public RedisChatMemory(StringRedisTemplate redis,
                           ObjectMapper objectMapper,
                           AppProperties.Chat chatConfig) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.ttlHours = chatConfig.getConversationTtlHours();
        this.maxStoredMessages = chatConfig.getMaxStoredMessages();
    }

    @Override
    public void add(String conversationId, List<Message> messages) {
        if (!StringUtils.hasText(conversationId) || messages == null || messages.isEmpty()) {
            return;
        }
        String key = key(conversationId);
        try {
            for (Message message : messages) {
                if (message == null) {
                    continue;
                }
                String payload = objectMapper.writeValueAsString(toRecord(message));
                redis.opsForList().rightPush(key, payload);
            }
            trimList(key);
            redis.expire(key, Duration.ofHours(ttlHours));
        } catch (JsonProcessingException e) {
            log.warn("对话消息序列化失败 conversationId={}", conversationId, e);
        }
    }

    @Override
    public List<Message> get(String conversationId, int lastN) {
        if (!StringUtils.hasText(conversationId) || lastN <= 0) {
            return List.of();
        }
        String key = key(conversationId);
        Long size = redis.opsForList().size(key);
        if (size == null || size == 0) {
            return List.of();
        }
        long start = Math.max(0, size - lastN);
        List<String> raw = redis.opsForList().range(key, start, -1);
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        List<Message> messages = new ArrayList<>(raw.size());
        for (String json : raw) {
            try {
                messages.add(fromRecord(objectMapper.readValue(json, new TypeReference<Map<String, String>>() {})));
            } catch (Exception e) {
                log.warn("对话消息反序列化失败 conversationId={}", conversationId, e);
            }
        }
        return messages;
    }

    @Override
    public void clear(String conversationId) {
        if (StringUtils.hasText(conversationId)) {
            redis.delete(key(conversationId));
        }
    }

    private void trimList(String key) {
        if (maxStoredMessages <= 0) {
            return;
        }
        Long size = redis.opsForList().size(key);
        if (size != null && size > maxStoredMessages) {
            redis.opsForList().trim(key, size - maxStoredMessages, -1);
        }
    }

    private static String key(String conversationId) {
        return KEY_PREFIX + conversationId;
    }

    private static Map<String, String> toRecord(Message message) {
        String type = message.getMessageType().name();
        return Map.of(
                "type", type,
                "content", message.getText() == null ? "" : message.getText()
        );
    }

    private static Message fromRecord(Map<String, String> record) {
        String type = record.getOrDefault("type", "USER");
        String content = record.getOrDefault("content", "");
        return switch (type) {
            case "ASSISTANT" -> new AssistantMessage(content);
            case "SYSTEM" -> new SystemMessage(content);
            default -> new UserMessage(content);
        };
    }
}
