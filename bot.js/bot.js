const Telegraf = require('telegraf'),
	{
		Extra,
		Markup,
		memorySession,
		reply
	} = require('telegraf'),
	LocalSession = require('telegraf-session-local'),
	fs = require("fs"),
	http = require("http");
	
const localSession = new LocalSession({
  database: './Counter.json',
  property: 'data',
  storage: LocalSession.storagefileAsync,
  format: {
    serialize: (obj) => JSON.stringify(obj, null, 2), // null & 2 for pretty-formatted JSON
    deserialize: (str) => JSON.parse(str)
  },
  state: { count: {total:{}} }
});

const bot = new Telegraf(token);
bot.telegram.getMe().then((botInfo) => {
	bot.options.id = botInfo.id
	bot.options.username = botInfo.username
});

bot.use(localSession.middleware());


bot.command('start', async (ctx) => {
	return piNightIntro(ctx);
});


bot.hears(/^\/topusers( )?((text(s)?|photo(s)?|video(s)?|video_note(s)?|audio|music|voice|sticker(s)?|doc(ument)?(s)?|))?/gi, async (ctx) => {
	
	//if a private chat or channel, ignore.
	if (ctx.chat.type==='private'||ctx.chat.type==='channel') return;
	
	// check for parameter
	if (typeof ctx.match[2]==='string'){
		type = ctx.match[2].toLowerCase();
		if (type==='location'||type==='venue') return;
		switch (type){
			case 'photos':
			case 'videos':
			case 'video_notes':
			case 'stickers':
			case 'documents':
			case 'text':
			type = type.toUpperCase().slice(0, -1);
			break;
			
			case 'music':
			type = 'AUDIO';
			break;
			
			case 'doc':
			case 'docs':
			type = 'DOCUMENT';
			break;
			
			case 'circle':
			type = 'AUDIO';
			break;
			
			default:
			type = type.toUpperCase();
			break;
		}
		obj = 'count_'+type;
		if (typeof ctx.dataDB.get('count').__wrapped__[obj]!=='object')ctx.dataDB.get('count').__wrapped__[obj] = (ctx.dataDB.get('count').__wrapped__[obj]||{});
		userCounts = (ctx.dataDB.get('count').__wrapped__[obj][ctx.chat.id]||{});
	} else {
		userCounts = (ctx.dataDB.get('count').__wrapped__.count[ctx.chat.id]||{});
	}
	cleanStats = [];
	i = 0;
	if (Object.keys(userCounts).length===0) return ctx.replyWithHTML('<b>No Data</b>');
	for (var key in userCounts) {
		//console.log(key, userCounts[key]);
		cleanStats[i] = [(userCounts[key]||0),parseInt(key)];
		i++;
	}
	cleanStats.sort(sortMulti);
	cleanStats.reverse();
	formattedMessage = '';
	for (i = 0; i < cleanStats.length; i++) {
		user = await bot.telegram.getChatMember(ctx.chat.id, cleanStats[i][1]);
		if (user.status==='left'||user.status==='kicked'){console.log('skip');break;}
		name = getName(user.user);
		count = numberWithCommas(cleanStats[i][0]);
		formattedMessage += '<b>'+(i+1)+'.</b> '+name+': '+count+'\n';
	}
	ctx.replyWithHTML('<b>Group Count Stats:</b>\n\n'+formattedMessage,{
		disable_notification: true
	});
});

bot.hears(/^\/topgroups( )?((text(s)?|photo(s)?|video(s)?|video_note(s)?|audio|music|voice|sticker(s)?|doc(ument)?(s)?|))?/gi, async (ctx) => {
	
	// check for parameter
	if (typeof ctx.match[2]==='string'){
		type = ctx.match[2].toLowerCase();
		if (type==='location'||type==='venue') return;
		switch (type){
			case 'photos':
			case 'videos':
			case 'video_notes':
			case 'stickers':
			case 'documents':
			case 'text':
			type = type.toUpperCase().slice(0, -1);
			break;
			
			case 'music':
			type = 'AUDIO';
			break;
			
			case 'doc':
			case 'docs':
			type = 'DOCUMENT';
			break;
			
			case 'circle':
			type = 'AUDIO';
			break;
			
			default:
			type = type.toUpperCase();
			break;
		}
		obj = 'count_'+type;
		if (typeof ctx.dataDB.get('count').__wrapped__[obj]!=='object')ctx.dataDB.get('count').__wrapped__[obj] = (ctx.dataDB.get('count').__wrapped__[obj]||{});
		userCounts = (ctx.dataDB.get('count').__wrapped__[obj].total||{});
	} else {
		userCounts = (ctx.dataDB.get('count').__wrapped__.count.total||{});
	}
	cleanStats = [];
	i = 0;
	for (var key in userCounts) {
		//console.log(key, userCounts[key]);
		cleanStats[i] = [userCounts[key],parseInt(key)];
		i++;
	}
	cleanStats.sort(sortMulti);
	cleanStats.reverse();
	formattedMessage = '';
	for (i = 0; i < cleanStats.length; i++) {
		user = await bot.telegram.getChat(cleanStats[i][1]);
		//format group name
		if (user.title>32) user.title = user.title.substring(0,29)+'...';
		if (user.username){
			var name = '<a href="https://t.me/' + user.username + '">' + user.title + '</a>';
		} else if (user.invite_link){
			var name = '<a href="'+ user.invite_link + '">' + user.title + '</a>';
		} else {
			name = '<b>'+user.title+'</b>';
		}
		count = numberWithCommas(cleanStats[i][0]);
		formattedMessage += '<b>'+(i+1)+'.</b> '+name+': '+count+'\n';
	}
	ctx.replyWithHTML('<b>Group Count Stats:</b>\n\n'+formattedMessage);
});


bot.on('new_chat_members', async(ctx) => {
	if (ctx.update.message.new_chat_member.id === bot.options.id) return piNightIntro(ctx);
});

bot.on('message', (ctx) =>  {
	
	//if a private chat or channel, ignore.
	if (ctx.chat.type==='private'||ctx.chat.type==='channel') return;
	
	//if a foward, ignore.
	if (ctx.message.forward_from_message_id) return;
	
	//check if this is a command, if true, then ignore it.
	if (ctx.message.entities && ctx.message.entities[0].offset===0 && ctx.message.entities[0].type==='bot_command') return;
	
	
	
	// check if total exists, if it doesn't lets make it
	if (typeof ctx.dataDB.get('count').__wrapped__.count.total!=='object')ctx.dataDB.get('count').__wrapped__.count.total = (ctx.dataDB.get('count').__wrapped__.count.total||{});
	
	// lets add the message count to the group total.
	groupCount = (ctx.dataDB.get('count').__wrapped__.count.total[ctx.chat.id]||0);
	groupCount++;
	ctx.dataDB.get('count').__wrapped__.count.total[ctx.chat.id] = groupCount;

	// check if user count exists, if it doesn't lets make it
	if (typeof ctx.dataDB.get('count').__wrapped__.count[ctx.chat.id]!=='object')ctx.dataDB.get('count').__wrapped__.count[ctx.chat.id] = (ctx.dataDB.get('count').__wrapped__.count[ctx.chat.id]||{});
	
	// now to add it to per-user count in each group.
	myCount = (ctx.dataDB.get('count').__wrapped__.count[ctx.chat.id][ctx.from.id]||0);
	myCount++;
	ctx.dataDB.get('count').__wrapped__.count[ctx.chat.id][ctx.from.id] = myCount;
	
	// check for files
	
	if (ctx.message.location||ctx.message.venue) return;
	
	
	// get type
	
	if (ctx.message.photo){
		docType = 'PHOTO';
	} else if (ctx.message.audio){
		docType = 'AUDIO';
	} else if (ctx.message.document){
		docType = 'DOCUMENT';
	} else if (ctx.message.sticker){
		docType = 'STICKER';
	} else if (ctx.message.voice){
		docType = 'VOICE';
	} else if (ctx.message.video_note){
		docType = 'VIDEO_NOTE';
	} else if (ctx.message.video){
		docType = 'VIDEO';
	} else {
		docType = 'TEXT';
	}
	obj = 'count_'+docType;
	
	
	// check if total exists, if it doesn't lets make it
	if (typeof ctx.dataDB.get('count').__wrapped__[obj]!=='object')ctx.dataDB.get('count').__wrapped__[obj] = (ctx.dataDB.get('count').__wrapped__[obj]||{total:{}});
	
	// lets add the message count to the group total.
	groupCount = (ctx.dataDB.get('count').__wrapped__[obj].total[ctx.chat.id]||0);
	groupCount++;
	ctx.dataDB.get('count').__wrapped__[obj].total[ctx.chat.id] = groupCount;

	// check if user count exists, if it doesn't lets make it
	if (typeof ctx.dataDB.get('count').__wrapped__[obj][ctx.chat.id]!=='object')ctx.dataDB.get('count').__wrapped__[obj][ctx.chat.id] = (ctx.dataDB.get('count').__wrapped__[obj][ctx.chat.id]||{});
	
	// now to add it to per-user count in each group.
	myCount = (ctx.dataDB.get('count').__wrapped__[obj][ctx.chat.id][ctx.from.id]||0);
	myCount++;
	ctx.dataDB.get('count').__wrapped__[obj][ctx.chat.id][ctx.from.id] = myCount;
	
});

//from https://stackoverflow.com/a/16097058
function sortMulti(a, b) {
    if (a[0] === b[0]) {
        return 0;
    }
    else {
        return (a[0] < b[0]) ? -1 : 1;
    }
}

//from https://stackoverflow.com/a/2901298
function numberWithCommas(x) {
	var parts = x.toString().split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return parts.join(".");
}

async function piNightIntro(ctx) {
	name = (ctx.chat.title||ctx.from.first_name);
	return ctx.reply('Hello <b>' + name + '</b>, I am <code>Message Counter Bot.</code>\n\nI am a Telegram bot simply counts the number of messages in a group-chat, by type.\n\nUnlike most bots, I am 100% Open-Source and I do not log any messages sent, only the User ID of the user, and the Chat ID it is sent in.', Extra.HTML().markup(Markup.inlineKeyboard([
		Markup.urlButton('Website', 'https://night.tf'),
		Markup.urlButton('Source Code', 'https://github.com/NightApps/piNightBot')
		//Markup.switchToChatButton('Add to Group', 'fsdff')
	], {
		columns: parseInt(2)
	}).resize()));
}

function getName(user) {
	var name = user.first_name;
	if (user.last_name) var name = user.first_name + ' ' + user.last_name;
	var id = user.id;
	var name = user.first_name;
	if (user.last_name) var name = user.first_name + ' ' + user.last_name;
	var id = user.id;
	var name = name.replace(/</gi, "＜");
	var name = name.replace(/>/gi, "＞");
	if (name.length>32) name = name.substring(0,29)+'...';
	var name = '<a href="tg://user?id=' + id + '">' + name + '</a>';
	return name;
}

bot.startPolling();
console.log('wow');
process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	// application specific logging, throwing an error, or other logic here
});
