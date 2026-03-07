import sys
import subprocess

with open('script.js', 'r') as f:
    js_code = f.read()

# We can use javascriptcore which is bundled on Mac, accessible via osascript
escaped_js = js_code.replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ')

# test if we can evaluate it with JSC
applescript = f'''
set jsCode to "{escaped_js}"
try
    run script jsCode in "JavaScript"
on error errMsg
    return errMsg
end try
return "OK"
'''

with open('test_jsc.scpt', 'w') as f:
    f.write(applescript)

print("Checking syntax using AppleScript/JavaScriptCore...")
res = subprocess.run(['osascript', 'test_jsc.scpt'], capture_output=True, text=True)
print("Result:")
print(res.stdout.strip())
print(res.stderr.strip())

