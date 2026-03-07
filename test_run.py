import urllib.request
import re

html_content = ""
with open("test_init.html", "r") as f:
    html_content = f.read()

print("Please open http://localhost:8080/test_init.html in your browser.")
