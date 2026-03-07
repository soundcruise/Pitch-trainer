import re

with open('script.js', 'r') as f:
    text = f.read()

# Pattern 1: document.getElementById('id')?.cmd(...)
# Example: document.getElementById('stage-select-btn')?.addEventListener('click', ...)
# Replacement: let _el = document.getElementById('stage-select-btn'); if (_el) _el.addEventListener('click', ...)

def replace_get_element(match):
    prefix = match.group(1)
    call = match.group(2)
    method = match.group(3)
    # e.g. prefix="        ", call="document.getElementById('stage-select-btn')", method="addEventListener('click', () => this.showStageSelector())"
    # Wait, the method part continues to the end of the line, which could include the semicolon.
    return f"{prefix}if ({call}) {call}.{method}"

# Regex to match: (whitespace)(document.getElementById(...))\?\.(.+)
text = re.sub(r'^(\s*)(document\.getElementById\([^\)]+\))\?\.(.+)$', replace_get_element, text, flags=re.MULTILINE)

# Pattern 2: variable?.addEventListener(...) -> if (variable) variable.addEventListener(...)
def replace_var_method(match):
    prefix = match.group(1)
    var = match.group(2)
    method = match.group(3)
    return f"{prefix}if ({var}) {var}.{method}"

text = re.sub(r'^(\s*)([a-zA-Z0-9_]+)\?\.(addEventListener.+)$', replace_var_method, text, flags=re.MULTILINE)

# Pattern 3: btn?.classList.contains('playing') -> btn && btn.classList.contains('playing')
text = re.sub(r'([a-zA-Z0-9_]+)\?\.(classList\.contains\([^\)]+\))', r'(\1 && \1.\2)', text)

with open('script.js', 'w') as f:
    f.write(text)

print("Done replacing.")
