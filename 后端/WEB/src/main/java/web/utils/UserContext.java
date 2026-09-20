package web.utils;

public class UserContext {
    private static final ThreadLocal<String> CURRENT_TABLE = new ThreadLocal<>();
    private static final ThreadLocal<String> USER_NAME = new ThreadLocal<>();

    public static void setTable(String tableName) { CURRENT_TABLE.set(tableName); }
    public static String getTable() { return CURRENT_TABLE.get(); }

    public static void setUserName(String userName) { USER_NAME.set(userName); }
    public static String getUserName() { return USER_NAME.get(); }

    public static void clear() {
        CURRENT_TABLE.remove();
        USER_NAME.remove();
    }
}