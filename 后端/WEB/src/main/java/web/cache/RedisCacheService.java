package web.cache;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import web.config.AppProperties;

import java.time.Duration;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;

/**
 * 统一 Redis 缓存：规范 key、TTL 抖动、写后删除、简单互斥防击穿。
 * <p>
 * Key 约定（均带前缀 {@code a08:}）：
 * <ul>
 *   <li>{@code a08:db:list:{userName}} — 用户的数据集目录列表 JSON</li>
 *   <li>{@code a08:lock:{业务key}} — 短时互斥锁</li>
 * </ul>
 * 不再缓存「整表 allData」，避免大 CSV 撑爆内存与 Redis。
 */
@Slf4j
@Service
public class RedisCacheService {

    private static final String PREFIX = "a08:";

    private final StringRedisTemplate stringRedisTemplate;
    private final AppProperties appProperties;

    public RedisCacheService(StringRedisTemplate stringRedisTemplate, AppProperties appProperties) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.appProperties = appProperties;
    }

    public String databaseListKey(String userName) {
        return PREFIX + "db:list:" + userName;
    }

    /** 匹配某用户下历史 data 缓存（迁移清理用） */
    public String legacyDataPattern(String userName) {
        return "data:username:tablename:" + userName + "*";
    }

    public String legacyDatabaseListKey(String userName) {
        return "username:database:" + userName;
    }

    public String get(String key) {
        return stringRedisTemplate.opsForValue().get(key);
    }

    public void set(String key, String json, long baseTtlMinutes) {
        long seconds = ttlSecondsWithJitter(baseTtlMinutes);
        stringRedisTemplate.opsForValue().set(key, json, Duration.ofSeconds(seconds));
        log.debug("Redis SET {} TTL={}s", key, seconds);
    }

    public void delete(String key) {
        stringRedisTemplate.delete(key);
    }

    /**
     * Cache-Aside：先读缓存，未命中则加锁回源并写入（带 TTL 抖动）。
     */
    public String getOrLoad(String key, long baseTtlMinutes, Supplier<String> loadFromDb) {
        String cached = get(key);
        if (cached != null) {
            return cached;
        }

        String lockKey = PREFIX + "lock:" + key;
        boolean locked = Boolean.TRUE.equals(
                stringRedisTemplate.opsForValue().setIfAbsent(
                        lockKey, "1", Duration.ofSeconds(appProperties.getCache().getLockTtlSeconds())));

        if (locked) {
            try {
                cached = get(key);
                if (cached != null) {
                    return cached;
                }
                String json = loadFromDb.get();
                if (json != null) {
                    set(key, json, baseTtlMinutes);
                }
                return json;
            } finally {
                stringRedisTemplate.delete(lockKey);
            }
        }

        try {
            Thread.sleep(appProperties.getCache().getLockWaitMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        cached = get(key);
        if (cached != null) {
            return cached;
        }
        return loadFromDb.get();
    }

    /** 用户上传/删除数据集后：删列表缓存，并清理旧版 key */
    public void evictAfterDatabaseMutation(String userName) {
        delete(databaseListKey(userName));
        delete(legacyDatabaseListKey(userName));
        deleteByPattern(legacyDataPattern(userName));
        log.debug("已清理用户 {} 的数据集相关缓存", userName);
    }

    public void deleteByPattern(String pattern) {
        Set<String> keys = scanKeys(pattern);
        if (!keys.isEmpty()) {
            stringRedisTemplate.delete(keys);
            log.debug("Redis 按模式删除 {} 共 {} 个 key", pattern, keys.size());
        }
    }

    private Set<String> scanKeys(String pattern) {
        Set<String> keys = new HashSet<>();
        ScanOptions options = ScanOptions.scanOptions().match(pattern).count(200).build();
        try (Cursor<String> cursor = stringRedisTemplate.scan(options)) {
            while (cursor.hasNext()) {
                keys.add(cursor.next());
            }
        }
        return keys;
    }

    private long ttlSecondsWithJitter(long baseMinutes) {
        int jitter = appProperties.getCache().getTtlJitterSecondsMax();
        int extra = jitter > 0 ? ThreadLocalRandom.current().nextInt(jitter + 1) : 0;
        return baseMinutes * 60L + extra;
    }
}
