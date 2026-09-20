package web.chat;

import org.springframework.util.StringUtils;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.utils.UserContext;

/**
 * 生成隔离的对话 ID：每个用户（及可选会话）独立一条记忆链。
 */
public final class ChatConversationIds {

    private ChatConversationIds() {
    }

    /**
     * @param sessionId 可选；同一用户多窗口/多标签时使用不同 sessionId
     */
    public static String resolve(String sessionId) {
        String userName = UserContext.getUserName();
        if (!StringUtils.hasText(userName)) {
            throw new BaseException(MessageEnum.UNAUTHORIZED);
        }
        if (StringUtils.hasText(sessionId)) {
            return userName + ":" + sessionId.trim();
        }
        return userName;
    }
}
