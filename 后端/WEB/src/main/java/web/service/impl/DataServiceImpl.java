package web.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import web.config.AppProperties;
import web.constant.StandardEnergySchema;
import web.dto.PredictRequestDTO;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.mapper.DataMapper;
import web.service.DataService;
import web.utils.TableNameHelper;
import web.vo.DataVO;
import web.vo.PredictResponseVO;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class DataServiceImpl implements DataService {

    @Autowired
    private DataMapper dataMapper;

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private AppProperties appProperties;

    /**
     * 全表数据不写入 Redis（行数大时易 OOM / 撑满 Redis），直接查库。
     */
    @Override
    public DataVO searchAllData(String tableName) {
        List<Map<String, Object>> mapList = dataMapper.searchAllData(tableName);
        return DataVO.builder().datas(mapList).build();
    }

    @Override
    public DataVO searchByColumnName(String tableName, String columnName) {
        requireAllowedColumn(columnName);
        return DataVO.builder()
                .datas(dataMapper.searchByColumnName(tableName, columnName))
                .build();
    }

    @Override
    public DataVO cheakColumnNames() {
        return DataVO.builder()
                .columnNames(dataMapper.cheakColumnNames(TableNameHelper.requireCurrentTable()))
                .build();
    }

    @Override
    public DataVO searchByCondition(String buildingName, String columnName, String beginDatetime, String endDatetime) {
        requireAllowedColumn(columnName);
        String beginTime = beginDatetime;
        String endTime = endDatetime;
        if (beginDatetime.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            beginTime = beginDatetime + " 00:00:00";
        }
        if (endTime.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            endTime = endDatetime + " 23:59:59";
        }
        return DataVO.builder()
                .datas(dataMapper.searchByCondition(
                        TableNameHelper.requireCurrentTable(),
                        buildingName,
                        columnName,
                        beginTime,
                        endTime))
                .build();
    }

    @Override
    public DataVO searchTodayEnergy(String date) {
        String table = TableNameHelper.requireCurrentTable();
        return DataVO.builder()
                .datas(dataMapper.searchTodayEnergy(
                        table,
                        StandardEnergySchema.COL_TIME,
                        StandardEnergySchema.COL_E_TOTAL,
                        date + " 00:00:00",
                        date + " 23:59:59"))
                .build();
    }

    @Override
    public DataVO totalByType(String date) {
        String table = TableNameHelper.requireCurrentTable();
        String beginTime = date + " 00:00:00";
        String endTime = date + " 23:59:59";

        double officeSmallSum = sumEnergy(table, beginTime, endTime, "Office_Small");
        double officeMediumSum = sumEnergy(table, beginTime, endTime, "Office_Medium");
        double residentialSum = sumEnergy(table, beginTime, endTime, "Residential");
        double schoolSum = sumEnergy(table, beginTime, endTime, "School");
        double hospitalSum = sumEnergy(table, beginTime, endTime, "Hospital");
        double hotelSum = sumEnergy(table, beginTime, endTime, "Hotel");
        double shoppingMallSum = sumEnergy(table, beginTime, endTime, "Shopping_Mall");

        List<Map<String, Object>> list = new ArrayList<>();
        list.add(Map.of("officeSmallSum", officeSmallSum));
        list.add(Map.of("officeMediumSum", officeMediumSum));
        list.add(Map.of("residentialSum", residentialSum));
        list.add(Map.of("schoolSum", schoolSum));
        list.add(Map.of("hospitalSum", hospitalSum));
        list.add(Map.of("hotelSum", hotelSum));
        list.add(Map.of("shoppingMallSum", shoppingMallSum));

        return DataVO.builder().datas(list).build();
    }

    private double sumEnergy(String table, String beginTime, String endTime, String buildingType) {
        List<Float> values = dataMapper.totalByType(
                table,
                StandardEnergySchema.COL_TIME,
                StandardEnergySchema.COL_E_TOTAL,
                StandardEnergySchema.COL_BUILDING_TYPE,
                beginTime,
                endTime,
                buildingType);
        return values.stream().mapToDouble(Float::doubleValue).sum();
    }

    @Override
    public DataVO contrast(String date, String buildingType, String columnName) {
        requireAllowedColumn(columnName);
        String table = TableNameHelper.requireCurrentTable();
        String beginTime = date + " 00:00:00";
        String endTime = date + " 23:59:59";
        return DataVO.builder()
                .datas(dataMapper.contrast(
                        table,
                        StandardEnergySchema.COL_TIME,
                        StandardEnergySchema.COL_BUILDING_TYPE,
                        columnName,
                        beginTime,
                        endTime,
                        buildingType))
                .build();
    }

    @Override
    public PredictResponseVO predict(PredictRequestDTO predictRequestDTO) throws JsonProcessingException {
        TableNameHelper.requireCurrentTable();
        String predictUrl = appProperties.getPredict().getServiceUrl();
        log.info("正在请求预测服务: {}", predictUrl);
        try {
            PredictResponseVO response = restTemplate.postForObject(
                    predictUrl, predictRequestDTO, PredictResponseVO.class);
            if (response != null) {
                return response;
            }
        } catch (Exception e) {
            log.warn("模型预测接口调用异常", e);
        }
        throw new BaseException(MessageEnum.UNKNOWN_ERROR);
    }

    private void requireAllowedColumn(String columnName) {
        if (!StandardEnergySchema.isAllowedDataColumn(columnName)) {
            throw new BaseException(MessageEnum.CSV_HEADER_INVALID);
        }
    }
}
