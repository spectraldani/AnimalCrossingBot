import {Chat, User} from "./api_types";
import moment from "moment-timezone";

interface BaseCommand {
    chat: Chat
    from: User
    message_id: number
}

export interface Command extends BaseCommand {
    kind: "command"
    date: moment.Moment
    order: [string, string[]]
}

export interface CallbackCommand<T> extends BaseCommand {
    kind: "callback_command"
    callback_query_id: string
    data: T
}
