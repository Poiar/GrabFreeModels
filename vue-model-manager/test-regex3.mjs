const regex = /(\w+)\s+(?:NOT\s+)?IN\s*\(\s*((?:"[^"]*"|[^)])+)\)|(\w+)\s+IS\s+NOT\s+EMPTY|(\w+)\s+IS\s+EMPTY|(?:NOT\s+)?(\w+)\s*(?:(\s*:>|\s*:<|\s*~|>|<|>=|<=|!=|:|=)\s*|(\s*~|>|<|>=|<=|!=))\s*(?:"([^"]*?)"|(\S+))/gi

let m = regex.exec('status IN (working,broken)')
if (m) console.log('IN match groups:', m.slice(1).map((g, i) => `[${i+1}]=${JSON.stringify(g)}`))
else console.log('No match')

regex.lastIndex = 0

// Try without the value capture complexity
const regex2 = /(\w+)\s+(?:NOT\s+)?IN\s*\(([^)]+)\)/gi
m = regex2.exec('status IN (working,broken)')
if (m) console.log('Simple IN match:', m.slice(1).map((g, i) => `[${i+1}]=${JSON.stringify(g)}`))
else console.log('No simple match')
