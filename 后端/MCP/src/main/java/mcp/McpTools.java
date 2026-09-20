package mcp;

import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class McpTools {

    @Autowired
    Mapper mapper;

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private McpAppProperties mcpAppProperties;

    /**
    @Tool(description = "查询当前表格所有内容，如果不知道用户想查找什么，请用此方法。")
    List<Map<String,Object>> searchAllData(
            @ToolParam(description = "当前操作的表名") String tableName
    ){
        log.info("模型正在查询:{}的所有内容", tableName);
        return mapper.searchAllData(tableName);
    }
    **/

    @Tool(description = "查询当前表的所有表头，以确认有哪些列名，如果用户提供的表头很模糊，请先用此方法。")
    List<String> checkColumnNames(
            @ToolParam(description = "当前操作的表名") String tableName
    ){
        log.info("模型正在查询:{}的所有表头", tableName);
        return mapper.cheakColumnNames(tableName);
    }

    @Tool(description = "根据用户指定的列名（表头）从当前表中检索数据。")
    List<Map<String,Object>> searchByColumnName(
            @ToolParam(description = "当前操作的表名") String tableName,
            @ToolParam(description = "具体的列名，如T_core,T_peri等") List<String> columnNames) {
        String columns = String.join(", ", columnNames);
        log.info("模型正在查询:{}的:{}", tableName, columns);
        return mapper.searchByColumnName(tableName, columns);
    }

    @Tool(description = "根据用户提供的建筑名查找一定时间段内的指定数据。")
    VO searchByCondition(
            @ToolParam(description = "当前操作的表名") String tableName,
            @ToolParam(description = "要查找的数据名，如果不确定请先查找表头，不能为空，可以为多，如T_core,如果用户未指定，填写'*'可输出所有数据") List<String> columnName,
            @ToolParam(description = "建筑名，对应表中的列名为Building_ID，比如“BLD_000”，允许为空。") String buildingName,
            @ToolParam(description = "查询的起始时间，注意格式为“yyyy-MM-dd HH:mm:ss”，如“2006-01-01 00:00:00”，允许为空") String beginDatetime,
            @ToolParam(description = "查询的结束时间，注意格式为“yyyy-MM-dd HH:mm:ss”，如“2006-01-01 00:00:00”，允许为空") String endDatetime
    ) {

        String columns = String.join(", ", columnName);
        log.info("模型正在从:{}查询:{}建筑的:{}，从:{}到:{}时间段的数据",tableName,buildingName, columns, beginDatetime,endDatetime);
        VO vo = VO.builder()
                .content(mapper.searchByCondition(columns, tableName, buildingName, beginDatetime, endDatetime))
                .build();
        return vo;
    }

    @Tool(description = "根据用户要求生成Excel报表，最后返回下载链接")
    String createExcel(
            @ToolParam(description = "一个List，包括列名和数据，根据用户的需求从另外的方法中获取数据并填入") List<Map<String, Object>> data,
            @ToolParam(description = "导出的Excel的名字，请根据用户需求总结") String excelName
    ){
        String baseUrl = mcpAppProperties.getWebBaseUrl().replaceAll("/$", "");
        String url = baseUrl + "/ai/export";
        int dataSize = data == null ? 0 : data.size();
        log.info("模型正在创建表格:{}", excelName);
        try {
            ExcelVO vo = ExcelVO.builder()
                    .data(data)
                    .excelName(excelName)
                    .build();

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Api-Key", mcpAppProperties.getInternalApiKey());
            HttpEntity<ExcelVO> request = new HttpEntity<>(vo, headers);

            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);
            String responseBody = response.getBody();
            String downloadUrl = responseBody == null ? "" : responseBody;
            return "处理完毕，下载链接为" + downloadUrl + "下载";
        } catch (HttpStatusCodeException e) {
            return "提交失败：HTTP " + e.getStatusCode().value()
                    + "，responseBody=" + e.getResponseBodyAsString()
                    + "；debug={url:" + url
                    + ", excelName:" + excelName
                    + ", dataSize:" + dataSize + "}";
        } catch (RestClientException e) {
            return "提交失败：" + e.getMessage()
                    + "；debug={url:" + url
                    + ", excelName:" + excelName
                    + ", dataSize:" + dataSize + "}";
        }
    }
}
