from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image
import json
import os
import io
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Register Chinese font (make sure you have a Chinese font file in the same directory)
def register_chinese_font():
    """Register Chinese font with better error handling"""
    try:
        # List of possible Chinese font paths
        font_paths = [
            # Local fonts in project directory
            "simsun.ttf",
            "msyh.ttf",
            "simhei.ttf",
            "STSONG.TTF",
            
            # In fonts folder
            "fonts/simsun.ttf",
            "fonts/msyh.ttf",
            "fonts/simhei.ttf",
            
            # Windows system fonts
            "C:/Windows/Fonts/simsun.ttc",
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/simhei.ttf",
            "C:/Windows/Fonts/msjh.ttc",  # Microsoft JhengHei
            
            # macOS system fonts
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/STHeiti Medium.ttc",
            
            # Linux system fonts
            "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
            "/usr/share/fonts/truetype/arphic/uming.ttc",
        ]
        
        # Try each font path
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    # Register the font with ReportLab
                    font_name = f'ChineseFont_{os.path.basename(font_path)}'
                    pdfmetrics.registerFont(TTFont(font_name, font_path))
                    print(f"✓ Successfully registered Chinese font: {font_path}")
                    return font_name
                except Exception as e:
                    print(f"⚠️  Could not register font {font_path}: {e}")
                    continue
        
        print("⚠️  No Chinese font found, using Helvetica (characters may be missing)")
        
    except Exception as e:
        print(f"⚠️  Font registration error: {e}")
    
    # Fallback to Helvetica (will show □ for Chinese characters)
    return 'Helvetica'
def find_photo_file(photo_number):
    """Find photo file with any extension"""
    if not photo_number:
        return None
    
    photo_dir = "photos"
    # Check various extensions and naming patterns
    patterns = [
        f"{photo_number}.png",
        f"{photo_number}.jpg",
        f"{photo_number}.jpeg",
        f"{photo_number}.PNG",
        f"{photo_number}.JPG",
        f"{photo_number}.JPEG",
        f"photo_{photo_number}.png",
        f"photo_{photo_number}.jpg",
        f"IMG_{photo_number}.jpg",
        f"{photo_number}_photo.png",
    ]
    
    for pattern in patterns:
        file_path = os.path.join(photo_dir, pattern)
        if os.path.exists(file_path):
            return file_path
    
    # Try to find any file containing the photo number
    try:
        for filename in os.listdir(photo_dir):
            if photo_number in filename:
                return os.path.join(photo_dir, filename)
    except:
        pass
    
    return None

def resize_and_crop_image(image_path, target_width, target_height):
    """Resize and crop image to fit the target dimensions while maintaining aspect ratio"""
    try:
        img = Image.open(image_path)
        
        # Convert to RGB if necessary (for PNG with transparency)
        if img.mode in ('RGBA', 'P', 'LA'):
            # Create a white background
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA':
                # Composite image on white background
                background.paste(img, mask=img.split()[3])  # Use alpha channel as mask
                img = background
            else:
                img = img.convert('RGB')
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Calculate aspect ratios
        img_ratio = img.width / img.height
        target_ratio = target_width / target_height
        
        # Resize image while maintaining aspect ratio
        if img_ratio > target_ratio:
            # Image is wider than target, resize based on height
            new_height = target_height
            new_width = int(target_height * img_ratio)
        else:
            # Image is taller than target, resize based on width
            new_width = target_width
            new_height = int(target_width / img_ratio)
        
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Calculate crop coordinates (center crop)
        left = max(0, (new_width - target_width) // 2)
        top = max(0, (new_height - target_height) // 2)
        right = min(new_width, left + target_width)
        bottom = min(new_height, top + target_height)
        
        # Crop to target dimensions
        img = img.crop((left, top, right, bottom))
        
        # Save to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG', quality=85)
        img_bytes.seek(0)
        
        return img_bytes
    except Exception as e:
        print(f"Error processing image {image_path}: {e}")
        return None

def generate_pdf_file(absent_ids, students_data, photo_mapping):
    filename = f"缺勤学生名单_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    
    
    
    # Register and get Chinese font
    chinese_font = register_chinese_font()
    print(f"Using font: {chinese_font}")
    
    # Set the Chinese font as default
    
    
    
    c = canvas.Canvas(filename, pagesize=A4)
    width, height = A4
    c.setFont(chinese_font, 12)
    
    
    # Add header with Chinese
    c.setFont(chinese_font, 18)
    c.drawString(30*mm, height-30*mm, "南京航空航天大学")
    c.setFont(chinese_font, 16)
    c.drawString(30*mm, height-45*mm, "缺勤学生名单")
    
    c.setFont(chinese_font, 12)
    c.drawString(30*mm, height-58*mm, "《批判性思维与创造力科学》(1900303W.02)")
    c.drawString(30*mm, height-68*mm, f"生成日期: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Draw a line
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.5)
    c.line(20*mm, height-75*mm, width-20*mm, height-75*mm)
    
    y_position = height - 90*mm
    item_height = 50*mm
    
    for i, student_id in enumerate(absent_ids):
        # Check if we need a new page
        if y_position < 50*mm:
            c.showPage()
            y_position = height - 30*mm
        
        name = students_data.get(student_id, "未知学生")
        photo_number = None
        
        # Find photo number from mapping
        for pic_num, sid in photo_mapping.items():
            if str(sid) == str(student_id):
                photo_number = str(pic_num)
                break
        
        # Photo frame dimensions
        photo_x = 20*mm
        photo_y = y_position - 40*mm
        photo_width = 30*mm
        photo_height = 40*mm
        
        # Draw photo frame
        c.setStrokeColorRGB(0.7, 0.7, 0.7)  # Light gray border
        c.setLineWidth(0.5)
        c.rect(photo_x, photo_y, photo_width, photo_height)
        
        # Add photo if exists
        photo_drawn = False
        if photo_number:
            photo_path = find_photo_file(photo_number)
            if photo_path and os.path.exists(photo_path):
                try:
                    # Convert mm to points for PIL (1mm = 2.83 points)
                    target_width_pts = int(photo_width * 2.83)
                    target_height_pts = int(photo_height * 2.83)
                    
                    # Resize and crop the image
                    img_bytes = resize_and_crop_image(photo_path, target_width_pts, target_height_pts)
                    
                    if img_bytes:
                        # Draw the image with a small margin inside the frame
                        margin = 1*mm
                        c.drawImage(ImageReader(img_bytes), 
                                   photo_x + margin, 
                                   photo_y + margin, 
                                   photo_width - 2*margin, 
                                   photo_height - 2*margin,
                                   preserveAspectRatio=True, mask='auto')
                        photo_drawn = True
                        print(f"✓ 成功添加照片: {photo_number} (学生: {student_id})")
                except Exception as e:
                    print(f"✗ 无法添加照片 {photo_number}: {e}")
        
        # If photo wasn't drawn, show placeholder
        if not photo_drawn and photo_number:
            c.setFont(chinese_font, 10)
            c.setFillColorRGB(0.5, 0.5, 0.5)
            # Center text in the photo box
            text_width = c.stringWidth(f"照片: {photo_number}", chinese_font, 10)
            text_x = photo_x + (photo_width - text_width) / 2
            c.drawString(text_x, photo_y + photo_height/2 - 3, f"照片: {photo_number}")
        
        # Add student info
        c.setFont(chinese_font, 14)
        c.drawString(55*mm, y_position-15*mm, f"姓名: {name}")
        c.setFont(chinese_font, 12)
        c.drawString(55*mm, y_position-30*mm, f"学号: {student_id}")
        
        # Add photo number info if available
        if photo_number:
            c.setFont(chinese_font, 10)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawString(55*mm, y_position-40*mm, f"照片编号: {photo_number}")
        
        # Add index
        c.setFont(chinese_font, 12)
        c.drawString(15*mm, y_position-15*mm, f"{i+1}.")
        
        # Draw a separator line
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(20*mm, y_position - item_height + 5*mm, width-20*mm, y_position - item_height + 5*mm)
        
        y_position -= item_height
    
    # Add summary
    c.setFont(chinese_font, 12)
    c.drawString(20*mm, 30*mm, f"总缺勤人数: {len(absent_ids)} 人")
    c.drawString(20*mm, 20*mm, f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    c.save()
    print(f"PDF文件生成完成: {filename}")
    return filename

@app.route('/generate-pdf', methods=['POST'])
def generate_pdf():
    try:
        data = request.get_json()
        absent_ids = data.get('absentIds', [])
        
        print(f"收到生成PDF请求，学生数量: {len(absent_ids)}")
        
        # Load student data
        with open('students/students.json', 'r', encoding='utf-8') as f:
            students_data = json.load(f)
        
        with open('students/photo-mapping.json', 'r', encoding='utf-8') as f:
            photo_mapping = json.load(f)
        
        filename = generate_pdf_file(absent_ids, students_data, photo_mapping)
        
        print(f"PDF生成成功，正在发送文件: {filename}")
        return send_file(filename, 
                        as_attachment=True, 
                        download_name=filename,
                        mimetype='application/pdf')
        
    except Exception as e:
        print(f"PDF生成错误: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'PDF Generator API'})

@app.route('/test-photo/<photo_id>', methods=['GET'])
def test_photo(photo_id):
    """Test endpoint to check if a photo exists"""
    photo_path = find_photo_file(photo_id)
    if photo_path and os.path.exists(photo_path):
        return jsonify({'exists': True, 'path': photo_path})
    return jsonify({'exists': False}), 404

@app.route('/check-files', methods=['GET'])
def check_files():
    """Check if required files exist"""
    files = {
        'students.json': os.path.exists('students/students.json'),
        'photo-mapping.json': os.path.exists('students/photo-mapping.json'),
        'photos_directory': os.path.exists('photos'),
        'chinese_font': os.path.exists('simsun.ttf') or os.path.exists('msyh.ttf')
    }
    
    # Count photos
    photo_count = 0
    if files['photos_directory']:
        photo_count = len([f for f in os.listdir('photos') if f.lower().endswith(('.png', '.jpg', '.jpeg'))])
    
    files['photo_count'] = photo_count
    return jsonify(files)

if __name__ == '__main__':
    # Ensure photos directory exists
    if not os.path.exists('photos'):
        os.makedirs('photos')
        print("⚠️  创建了照片目录。请将学生照片放在 'photos/' 目录中。")
    
    # Check for required directories
    if not os.path.exists('students'):
        os.makedirs('students')
        print("⚠️  创建了学生数据目录。请将 students.json 和 photo-mapping.json 放在 'students/' 目录中。")
    
    print("📁 文件结构检查:")
    print(f"  photos/ 目录存在: {os.path.exists('photos')}")
    print(f"  students/ 目录存在: {os.path.exists('students')}")
    
    if os.path.exists('photos'):
        photos = [f for f in os.listdir('photos') if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        print(f"  找到 {len(photos)} 张照片: {photos[:5]}{'...' if len(photos) > 5 else ''}")
    
    print("\n🚀 启动PDF生成服务在 http://localhost:5000")
    print("🔗 健康检查: http://localhost:5000/health")
    print("📁 文件检查: http://localhost:5000/check-files")
    
    app.run(debug=True, port=5000, host='0.0.0.0')