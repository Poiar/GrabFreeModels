// Exact regex from the source file
const regex = /(\w+)\s+(?:NOT\s+)?IN\s*\(\s*((?:"[^"]*"|[^)])+)\)|(\w+)\s+IS\s+NOT\s+EMPTY|(\w+)\s+IS\s+EMPTY|(?:NOT\s+)?(\w+)\s*(?:(\s*:>|\s*:<|\s*~|>|<|>=|<=|!=|:|=)\s*|(\s*~|>|<|>=|<=|!=))\s*(?:"([^"]*?)"|(\S+))/gi

// Test context:>100000
let m = regex.exec('context:>100000')
console.log('context:>100000:', m ? m.slice(1).map((g,i)=>'['+(i+1)+']='+JSON.stringify(g)) : 'NULL')

regex.lastIndex = 0

// Test status IN (working,broken)
m = regex.exec('status IN (working,broken)')
console.log('status IN:', m ? m.slice(1).map((g,i)=>'['+(i+1)+']='+JSON.stringify(g)) : 'NULL')

regex.lastIndex = 0

// Test status:working
m = regex.exec('status:working')
console.log('status:working:', m ? m.slice(1).map((g,i)=>'['+(i+1)+']='+JSON.stringify(g)) : 'NULL')

regex.lastIndex = 0

// Test context in parser context (after paren stripping)
m = regex.exec('status IN (working,broken)')
console.log('status IN (from parse context):', m ? m.slice(1).map((g,i)=>'['+(i+1)+']='+JSON.stringify(g)) : 'NULL')
