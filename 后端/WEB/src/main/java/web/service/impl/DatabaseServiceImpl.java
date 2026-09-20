package web.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opencsv.CSVReader;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import web.cache.RedisCacheService;
import web.config.AppProperties;
import web.constant.StandardEnergySchema;
import web.dto.DatabaseDTO;
import web.dto.Result;
import web.entity.DatabaseEntity;
import web.entity.SessionEntity;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.mapper.DatabaseMapper;
import web.mapper.SessionMapper;
import web.service.DatabaseService;
import web.utils.UserContext;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DatabaseServiceImpl implements DatabaseService {

    @Autowired
    private DatabaseMapper databaseMapper;

    @Autowired
    private SessionMapper sessionMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RedisCacheService redisCacheService;

    @Autowired
    private AppProperties appProperties;

    public void autoCreateAndInsert(MultipartFile file, String name) throws Exception {
        InputStreamReader reader = new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8);
        CSVReader csvReader = new CSVReader(reader);

        String[] headers = csvReader.readNext();
        if (headers == null) {
            throw new RuntimeException("文件是空的！");
        }
        try {
            StandardEnergySchema.validateCsvHeaders(headers);
        } catch (IllegalArgumentException e) {
            log.warn("CSV 表头校验失败: {}", e.getMessage());
            throw new BaseException(MessageEnum.CSV_HEADER_INVALID);
        }

        String[] firstRowData = csvReader.readNext();
        if (firstRowData == null) {
            throw new RuntimeException("没有数据行！");
        }

        String databaseName = name + "_" + UserContext.getUserName();

        StringBuilder columnSql = new StringBuilder();
        for (int i = 0; i < headers.length; i++) {
            String val = (i < firstRowData.length) ? firstRowData[i].trim() : "";
            String type;
            if (val.isEmpty()) type = "VARCHAR(255)";
            else if (val.matches("^-?\\d+$")) type = "BIGINT";
            else if (val.matches("^-?\\d+(\\.\\d+)?$")) type = "DOUBLE";
            else if (val.matches("\\d{4}-\\d{2}-\\d{2}(\\s\\d{2}:\\d{2}:\\d{2})?")) type = "DATETIME";
            else type = "TEXT";

            columnSql.append("`").append(headers[i].trim()).append("` ").append(type);
            if (i < headers.length - 1) columnSql.append(", ");
        }

        databaseMapper.executeSql(String.format(
                "CREATE TABLE `%s` (id BIGINT AUTO_INCREMENT PRIMARY KEY, %s)", databaseName, columnSql));

        String columnsJoined = Arrays.stream(headers).map(h -> "`" + h.trim() + "`").collect(Collectors.joining(", "));
        String insertPrefix = String.format("INSERT INTO `%s` (%s) VALUES ", databaseName, columnsJoined);

        List<String[]> batchRows = new ArrayList<>();
        batchRows.add(firstRowData);

        String[] nextLine;
        int batchSize = 500;

        while ((nextLine = csvReader.readNext()) != null) {
            batchRows.add(nextLine);
            if (batchRows.size() >= batchSize) {
                flushBatch(insertPrefix, batchRows);
                batchRows.clear();
            }
        }

        if (!batchRows.isEmpty()) {
            flushBatch(insertPrefix, batchRows);
        }

        log.info("表 {} 自动创建并批量写入完成", databaseName);
    }

    private void flushBatch(String prefix, List<String[]> rows) {
        StringBuilder sql = new StringBuilder(prefix);
        for (int i = 0; i < rows.size(); i++) {
            String[] row = rows.get(i);
            sql.append("(");
            for (int j = 0; j < row.length; j++) {
                // 转义单引号：' -> ''
                String cell = (row[j] == null) ? "" : row[j].replace("'", "''");
                sql.append("'").append(cell).append("'");
                if (j < row.length - 1) sql.append(", ");
            }
            sql.append(")");
            if (i < rows.size() - 1) {
                sql.append(", ");
            }
        }
        databaseMapper.executeSql(sql.toString());
    }

    @Override
    public void upload(MultipartFile file, DatabaseDTO databaseDTO) throws Exception {
        String userName = UserContext.getUserName();
        Long id = databaseMapper.findDatabaseByName(databaseDTO.getName(), userName);
        if (id != null) {
            throw new BaseException(MessageEnum.FILE_ALREADY_EXISTS);
        }

        log.info("正在解析文件，上传用户为:{}", userName);
        autoCreateAndInsert(file, databaseDTO.getName());

        DatabaseEntity databaseEntity = DatabaseEntity.builder()
                .userName(userName)
                .name(databaseDTO.getName())
                .createTime(LocalDateTime.now())
                .updateTime(LocalDateTime.now())
                .desc(databaseDTO.getDesc())
                .build();
        databaseMapper.insertDatabase(databaseEntity);
        select(databaseDTO.getName());
        redisCacheService.evictAfterDatabaseMutation(userName);
    }

    @Override
    public Result check(Integer pageNum, Integer pageSize) throws JsonProcessingException {
        String userName = UserContext.getUserName();
        String cacheKey = redisCacheService.databaseListKey(userName);
        long ttlMinutes = appProperties.getCache().getDatabaseListTtlMinutes();

        String databaseJson = redisCacheService.getOrLoad(cacheKey, ttlMinutes, () -> {
            try {
                List<DatabaseEntity> list = databaseMapper.findAllDatabase(userName);
                return objectMapper.writeValueAsString(list);
            } catch (JsonProcessingException e) {
                throw new RuntimeException(e);
            }
        });

        List<DatabaseEntity> list = objectMapper.readValue(
                databaseJson, new TypeReference<List<DatabaseEntity>>() {});

        long total = list.size();
        int from = Math.max(0, (pageNum - 1) * pageSize);
        if (from >= list.size()) {
            return Result.ok("查询成功", List.of(), total);
        }
        int to = Math.min(from + pageSize, list.size());
        List<DatabaseEntity> page = new ArrayList<>(list.subList(from, to));
        log.info("数据集列表查询成功, user={}, total={}", userName, total);
        return Result.ok("查询成功", page, total);
    }

    @Override
    public void delete(String name) {
        String userName = UserContext.getUserName();
        Long id = databaseMapper.findDatabaseByName(name, userName);
        if (id == null || id == 0) {
            throw new BaseException(MessageEnum.FILE_NOT_EXISTS);
        }
        String fullTableName = name + "_" + userName;
        databaseMapper.deleteDatabase(name, userName);
        databaseMapper.dropTable(fullTableName);
        redisCacheService.evictAfterDatabaseMutation(userName);
    }

    @Override
    public void select(String name) {
        String databaseName = name + "_" + UserContext.getUserName();
        sessionMapper.update(SessionEntity.builder()
                .userName(UserContext.getUserName())
                .updateTime(LocalDateTime.now())
                .tableName(databaseName)
                .build());
    }
}
