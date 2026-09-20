package web.utils;

import web.enumeration.MessageEnum;
import web.exception.BaseException;

public final class TableNameHelper {

    private TableNameHelper() {
    }

    public static String requireCurrentTable() {
        String table = UserContext.getTable();
        if (table == null || table.isBlank()) {
            throw new BaseException(MessageEnum.TABLE_NOT_SELECTED);
        }
        return table;
    }
}
