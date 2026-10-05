on run argv
	set toAddr to item 1 of argv
	set txtPath to item 2 of argv
	set subj to item 3 of argv
	set plainContent to read (POSIX file txtPath) as «class utf8»

	tell application "Mail"
		activate
		set msg to make new outgoing message with properties {subject:subj, content:plainContent, visible:true}
		tell msg to make new to recipient at end of to recipients with properties {address:toAddr}
	end tell

return subj
end run
