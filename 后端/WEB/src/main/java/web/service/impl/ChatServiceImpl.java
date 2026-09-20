package web.service.impl;

import com.alibaba.excel.EasyExcel;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import web.service.ChatService;

import java.io.OutputStream;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class ChatServiceImpl implements ChatService {
    private final Map<String, List<Map<String, Object>>> reportCache = new ConcurrentHashMap<>();

    /**
     * 处理数据并存入缓存
     * @param data
     * @return
     */
    public void prepareReportData(List<Map<String, Object>> data, String excelName) {
        reportCache.put(excelName, data);
    }

    private List<List<Object>> convertToSimpleList(List<Map<String, Object>> data, List<String> headKeys) {
        List<List<Object>> rows = new ArrayList<>();
        for (Map<String, Object> map : data) {
            List<Object> row = new ArrayList<>();
            for (String key : headKeys) {
                Object value = map.get(key);

                if (value instanceof List || value instanceof Object[]) {
                    row.add(smartFormatList(value));
                } else if (value == null) {
                    row.add("");
                } else {
                    row.add(value.toString());
                }
            }
            rows.add(row);
        }
        return rows;
    }

    private String smartFormatList(Object value) {
        List<?> list;
        if (value instanceof List) {
            list = (List<?>) value;
        } else {
            list = Arrays.asList((Object[]) value);
        }

        if (list.isEmpty()) return "";

        boolean isDateLike = list.size() >= 3 && list.stream().allMatch(item -> item instanceof Number);

        if (isDateLike) {
            try {
                StringBuilder sb = new StringBuilder();
                sb.append(list.get(0));
                sb.append("-").append(String.format("%02d", ((Number)list.get(1)).intValue())); // 月
                sb.append("-").append(String.format("%02d", ((Number)list.get(2)).intValue())); // 日

                if (list.size() >= 5) {
                    sb.append(" ").append(String.format("%02d", ((Number)list.get(3)).intValue()));
                    sb.append(":").append(String.format("%02d", ((Number)list.get(4)).intValue()));
                }
                return sb.toString();
            } catch (Exception e) {
                return StringUtils.join(list, "-");
            }
        }

        return StringUtils.join(list, "-");
    }

    private List<List<String>> createHead(Set<String> keys) {
        List<List<String>> head = new ArrayList<>();
        for (String key : keys) {
            List<String> col = new ArrayList<>();
            col.add(key);
            head.add(col);
        }
        return head;
    }

    /**
     * 生成Excel
     * @param excelName
     */
    public void createExcel(String excelName, OutputStream outputStream) {
        List<Map<String, Object>> data = reportCache.get(excelName);
        if (data == null || data.isEmpty()) return;

        List<String> keys = new ArrayList<>(data.get(0).keySet());

        log.info("正在解析数据");
        List<List<Object>> cleanRows = convertToSimpleList(data, keys);
        List<List<String>> cleanHead = createHead(data.get(0).keySet());

        log.info("解析完毕，获得表头:{}", cleanHead);

        log.info("正在生成文件:{}", excelName);
        EasyExcel.write(outputStream)
                .head(cleanHead)
                .sheet(excelName)
                .doWrite(cleanRows);
        log.info("生成完毕！");
    }


    public boolean hasReportData(String excelName) {
        return reportCache.containsKey(excelName) && reportCache.get(excelName) != null;
    }

}
