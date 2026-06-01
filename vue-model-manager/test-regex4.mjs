const regex = /(\w+)(\s*:>|\s*:<|\s*~|>|<|>=|<=|!=|:|=)(\S+)/
const m = regex.exec('context:>100000')
if (m) console.log('Groups:', m.slice(1).map((g,i) => `[${i+1}]=${JSON.stringify(g)}`))

// The \s* before :> is the problem — no space means : matches first
const regex2 = /(\w+)(:>|:<|~|>|<|>=|<=|!=|:|=)(\S+)/
const m2 = regex2.exec('context:>100000')
if (m2) console.log('Fixed groups:', m2.slice(1).map((g,i) => `[${i+1}]=${JSON.stringify(g)}`))
