package web.service;


import java.io.OutputStream;
import java.util.List;
import java.util.Map;

public interface ChatService {
    /**
     * 处理数据并存入缓存
     * @param data
     * @return
     */
    void prepareReportData(List<Map<String, Object>> data, String excelName);

    /**
     * 生成Excel
     * @param excelName
     */
    void createExcel(String excelName, OutputStream outputStream);

    boolean hasReportData(String excelName);
}
