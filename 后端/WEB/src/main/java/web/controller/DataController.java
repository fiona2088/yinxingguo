package web.controller;


import com.fasterxml.jackson.core.JsonProcessingException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.MessageSource;
import org.springframework.web.bind.annotation.*;
import web.dto.PredictRequestDTO;
import web.dto.Result;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.service.DataService;
import web.utils.TableNameHelper;
import web.utils.UserContext;
import web.vo.DataVO;
import web.vo.PredictResponseVO;

@Slf4j
@RestController
@RequestMapping("/statistics")
public class DataController {
    @Autowired
    private DataService dataService;

    @Autowired
    private MessageSource messageSource;

    /**
     * 查找全部
     * @return
     */
    @GetMapping("/checkAll")
    public Result searchAllData() {
        String table = TableNameHelper.requireCurrentTable();
        log.info("正在查询:{}的全部数据", table);
        DataVO dataVO = dataService.searchAllData(table);

        log.info("查询完毕");
        return Result.ok("查询成功", dataVO);
    }

    /**
     * 查找今日能耗
     * @return
     */
    @GetMapping("/today")
    public Result searchTodayEnergy(@RequestParam String date) {
        log.info("正在查询:{}的总能耗", date);
        DataVO dataVO = dataService.searchTodayEnergy(date);
        return Result.ok("查询成功", dataVO.getDatas());
    }

    /**
     * 根据表头查询
     * @param columnName
     * @return
     */
    @GetMapping("/data")
    public Result searchByColumnName(@RequestParam String columnName) {
        if (columnName == null || columnName.isEmpty()) {
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        String table = TableNameHelper.requireCurrentTable();
        log.info("正在从:{}查询:{}", table, columnName);
        DataVO dataVO = dataService.searchByColumnName(table, columnName);
        return Result.ok("查询完成", dataVO.getDatas());
    }

    /**
     * 根据条件查询
     * @param buildingName
     * @param beginDatetime
     * @param endDatetime
     * @return
     */
    @GetMapping("/search")
    public Result searchByCondition(@RequestParam String buildingType, String energyType, String beginDateTime, String endDateTime) {
        if (buildingType == null || buildingType.isEmpty()) {
            log.info("buildingType为空");
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        if (energyType == null || energyType.isEmpty()) {
            log.info("energyType为空");
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        if (beginDateTime == null || beginDateTime.isEmpty()) {
            log.info("beginDateTime为空");
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        if (endDateTime == null || endDateTime.isEmpty()) {
            log.info("endDateTime为空");
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }

        log.info("正在从:{}中查询:{}的:{}，从:{}到:{}", UserContext.getTable(), buildingType, energyType, beginDateTime, endDateTime);

        DataVO dataVO = dataService.searchByCondition(buildingType, energyType, beginDateTime, endDateTime);

        log.info("查询成功");
        return Result.ok("查询成功", dataVO.getDatas());
    }

    /**
     * 查看表头，内部使用
     * @return
     */
    @GetMapping("/columns")
    public Result cheakColumnNames() {
        log.info("正在查看:{}的所有表头", UserContext.getTable());
        DataVO dataVO = dataService.cheakColumnNames();
        return Result.ok("查询完成", dataVO.getColumnNames());
    }

    /**
     * 查询类型总和
     * @param date
     * @return
     */
    @GetMapping("/type")
    public Result totalByType(@RequestParam String date) {
        log.info("正在查看:{}:{}各种能耗占比", UserContext.getTable(), date);
        DataVO dataVO = dataService.totalByType(date);

        log.info("查询成功");

        return Result.ok("查询成功",  dataVO);
    }

    @GetMapping("/contrast")
    public Result contrast(@RequestParam String date, String buildingType, String energyType) {
        log.info("正在对比表:{}:{}的:{}的:{}", UserContext.getTable(), date, buildingType, energyType);

        DataVO dataVO = dataService.contrast(date, buildingType, energyType);
        log.info("查询成功");
        return Result.ok("查询成功", dataVO);
    }

    @PostMapping("/predict")
    public Result predict(@RequestBody PredictRequestDTO predictRequestDTO) {
        log.info("Controller 接收到的数据: {}", predictRequestDTO.toString());
        log.info("正在预测");
        PredictResponseVO predictVO = null;
        try {
            predictVO = dataService.predict(predictRequestDTO);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
        return Result.ok("预测成功", predictVO);
    }
}
