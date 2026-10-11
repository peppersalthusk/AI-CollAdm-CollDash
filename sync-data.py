"""从 data.json 生成 data.js，供 file:// 双击打开时使用。"""
import json
from pathlib import Path

root = Path(__file__).parent
data = json.loads(root.joinpath('data.json').read_text(encoding='utf-8'))
content = (
    '// Auto-generated from data.json — run: python sync-data.py\n'
    'window.SCHOOLS_DATA = '
    + json.dumps(data, ensure_ascii=False, indent=2)
    + ';\n'
)
root.joinpath('data.js').write_text(content, encoding='utf-8')
print('Generated data.js')
