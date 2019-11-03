let helpItems = {
    $intro: 'The following are the available commands. They will guide you when you use them. And if you need further help with a command, send /help [command], eg. /help post',
    post: 'post a new item to your channel(s)',
    settings: 'change your channel\'s settings like watermarking logo etc.',
    license: 'view your channels\' license information',
}

let helpDetails = {
    post: 'Command /post\n\nThis command lets you make a new post. It asks the title of the post, the description and the price of the item. Then it produces a caption from a template (which is customizable through the /settings => "Caption template"). It also asks you photos of the item and produces a collage so that the channel will not be cluttered with many photos. If you have set a logo for the channel, it watermarks the photos so that your logo appears on them (including the collage). The watermark logo can be set in /settings => "Logo".',
    settings: 'Command /settings\n\nThis command lets you customize some aspects of your channels. It has five components:\n\n'
        + Object.entries({
            'Logo': 'Here, you can set the logo of the channel that will be used to watermark the photos posted on it.',

            'Caption template': 'You can set the template used to make the caption of the collage of the new item. You can include anything as long as you include the necessary components in any order.',

            'Contact text': 'This is the text added on the caption of the item sent to the customer when they select "Buy" on an item.',

            'Sold template': 'You can set how you want the caption to change when it is marked sold. It can contain anything as long as it contains the caption placeholder.',

            'Description bullet': 'This setting lets you change the character(s) that replace the "." (dot) in the line beginnings of the description. This means you can list e.g. features of the item indicating the list items with . and it will replace the dot with whatever you define in this setting. The default is the bullet character (like in this text.)',

            'Update permissions': 'This setting retrieves admins\' permissions from Telegram so that the permissions can be used with the bot as well. Four permissions are retrieved:\n  ◦ Post messages (to post)\n  ◦ Change channel info (for settings)\n  ◦ Edit messages (to edit and repost others posts)\n  ◦ Delete messages (to delete others posts)\nNote: the person who is registered as the admin of the channel here and the creator of the channel (if they are not the same person) will always be granted all permissions.'
        }).map(([key, val]) => '<b>' + key + '</b>: ' + val).join('\n\n'),
    license: 'Command /license\n\nThis command shows the license information of your registered channels. You can see when it will expire (or if it has.) Licenses are shown per channel.\n\nWhen your channel\'s license expires, you will not be able to post new items, change settings, edit or repost existing items. However, already posted items will continue to be functional. You will get notifications when someone selects your item, you can mark an item sold and delete it (But not repost it).',
}

function handleHelp(ctx) {
    let text = ctx.update.message.text
    if (ctx.state.isChannelAdmin) {
        if (text === '/help') {
            let helpText = helpItems.$intro + '\n'
            for (let [command, expln] of Object.entries(helpItems).filter(e => e[0][0] !== '$')) {
                helpText += '\n/' + command + ' - ' + expln
            }
            ctx.reply(helpText)
        } else {
            let item = text.split(' ', 2)[1]
            if (item[0] === '/') item = item.slice(1)
            if (Object.keys(helpDetails).includes(item)) {
                ctx.reply(helpDetails[item], {parse_mode: 'html'})
            } else {
                ctx.reply('Command not found. See /help.')
            }
        }
    } else {
        ctx.reply(ctx.fallbackReply)
    }
}

module.exports = {
    handleHelp
}
