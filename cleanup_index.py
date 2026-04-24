import os

file_path = r'c:\Users\campe\Desktop\guardianes-project\public\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the last </script> tag
last_script_idx = -1
for i in range(len(lines)-1, -1, -1):
    if '</script>' in lines[i]:
        last_script_idx = i
        break

if last_script_idx != -1:
    new_lines = lines[:last_script_idx+1]
    new_lines.append('</body>\n')
    new_lines.append('</html>\n')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Successfully cleaned up {file_path}. Kept up to line {last_script_idx+1}")
else:
    print("Could not find </script> tag")
