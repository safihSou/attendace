// Student data - loaded from JSON file
let studentData = {};
let photoMapping = {};

// Load student data from JSON file
async function loadStudentData() {
    try {
        const response = await fetch('./students/students.json');
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        studentData = await response.json();
        console.log('学生数据加载成功');
        
        // Load photo mapping
        const mappingResponse = await fetch('./students/photo-mapping.json');
        if (mappingResponse.ok) {
            photoMapping = await mappingResponse.json();
            console.log('照片映射加载成功');
        }
        
    } catch (error) {
        console.error('加载学生数据时出错:', error);
        showError('加载学生数据库时出错。请检查控制台获取详细信息。');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadStudentData();
    setupEventListeners();
});

function setupEventListeners() {
    // Real-time input monitoring
    const textarea = document.getElementById('absentIds');
    textarea.addEventListener('input', function() {
        processInput();
    });
    
    // Auto-clear placeholder on focus
    textarea.addEventListener('focus', function() {
        if (this.value === this.placeholder) {
            this.value = '';
        }
    });
}

function processInput() {
    const input = document.getElementById('absentIds').value;
    
    // Debug: log what we're receiving
    console.log("Raw input:", input);
    
    // Support both line breaks and commas - with WeChat format cleaning
    const absentIds = input.split(/[\n,]/)
        .map(id => {
            console.log("Original line:", id);
            
            // First, remove any number at the start with punctuation
            let cleaned = id.replace(/^\s*\d+\s*[\.\-\)]\s*/, '');
            console.log("After first clean:", cleaned);
            
            // If nothing was removed by first pattern, try other patterns
            if (cleaned === id.trim()) {
                cleaned = cleaned.replace(/^\s*\d+\s*-\s*/, '');
                console.log("After second clean:", cleaned);
            }
            
            // Remove any leading/trailing spaces
            cleaned = cleaned.trim();
            console.log("Final cleaned:", cleaned);
            
            return cleaned;
        })
        .filter(id => id !== '' && /^\d{9}$/.test(id));
    
    console.log("Filtered IDs:", absentIds);
    
    // Update counter - fix the display text
    document.getElementById('idCount').textContent = `已输入 ${absentIds.length} 个学号`;
    
    return absentIds;
}

function generatePDF() {
    const absentIds = processInput();
    
    if (absentIds.length === 0) {
        alert('请至少输入一个有效的学生学号');
        return;
    }
    
    // Validate IDs exist in database
    const invalidIds = absentIds.filter(id => !studentData[id]);
    if (invalidIds.length > 0) {
        alert(`以下学号未找到: ${invalidIds.join(', ')}`);
        return;
    }
    
    showPreview(absentIds);
    
    // Generate PDF using Flask backend
    generatePDFWithBackend(absentIds);
}

// Get photo number for student ID
function getPhotoNumber(studentId) {
    // Find photo number from mapping
    for (const [photoNum, id] of Object.entries(photoMapping)) {
        if (id === studentId) {
            return photoNum;
        }
    }
    return null;
}

// Show preview of absent students
function showPreview(absentIds) {
    const previewContent = document.getElementById('previewContent');
    const previewSection = document.getElementById('preview');
    const previewTotal = document.getElementById('previewTotal');
    
    if (absentIds.length === 0) {
        previewSection.style.display = 'none';
        return;
    }
    
    previewContent.innerHTML = '';
    previewTotal.textContent = `${absentIds.length} 人`;
    
    absentIds.forEach((id, index) => {
        const studentName = studentData[id] || '未知学生';
        const photoNumber = getPhotoNumber(id);
        
        const card = document.createElement('div');
        card.className = 'student-card';
        
        // Create photo container
        const photoContainer = document.createElement('div');
        photoContainer.className = 'student-photo';
        
        if (photoNumber) {
            const img = document.createElement('img');
            // Add cache busting to prevent cached images
            img.src = `photos/${photoNumber}.png?t=${Date.now()}`;
            img.alt = `${studentName}的照片`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '5px';
            
            img.onerror = function() {
                console.log(`预览图片加载失败: ${photoNumber}`);
                this.style.display = 'none';
                const fallbackText = document.createElement('div');
                fallbackText.style.width = '100%';
                fallbackText.style.height = '100%';
                fallbackText.style.display = 'flex';
                fallbackText.style.alignItems = 'center';
                fallbackText.style.justifyContent = 'center';
                fallbackText.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                fallbackText.style.color = 'white';
                fallbackText.style.fontSize = '12px';
                fallbackText.style.fontWeight = 'bold';
                fallbackText.style.textAlign = 'center';
                fallbackText.style.padding = '5px';
                fallbackText.style.borderRadius = '5px';
                fallbackText.textContent = `照片 ${photoNumber}`;
                photoContainer.appendChild(fallbackText);
            };
            
            photoContainer.appendChild(img);
        } else {
            photoContainer.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; 
                           background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%); color: white; 
                           font-size: 12px; font-weight: bold; text-align: center; padding: 5px; border-radius: 5px;">
                    无照片
                </div>
            `;
        }
        
        // Create info container
        const infoContainer = document.createElement('div');
        infoContainer.className = 'student-info';
        infoContainer.innerHTML = `
            <div class="student-name">${studentName}</div>
            <div class="student-id">学号: ${id}</div>
            ${photoNumber ? `<div style="font-size: 12px; color: #666; margin-top: 5px; background: #f0f0f0; padding: 3px 8px; border-radius: 3px; display: inline-block;">照片编号: ${photoNumber}</div>` : ''}
        `;
        
        card.appendChild(photoContainer);
        card.appendChild(infoContainer);
        previewContent.appendChild(card);
    });
    
    previewSection.style.display = 'block';
    
    // Scroll to preview
    setTimeout(() => {
        previewSection.scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

// Generate PDF using Flask backend (this will embed actual photos)
async function generatePDFWithBackend(absentIds) {
    try {
        showSuccess('正在生成PDF，请稍候...');
        
        // FIXED: Changed from localhost:5000 to your PythonAnywhere URL
        const backendUrl = 'https://anawahd2.eu.pythonanywhere.com';
        
        // Send request to Flask backend
        const response = await fetch(`${backendUrl}/generate-pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ absentIds: absentIds })
        });
        
        if (!response.ok) {
            throw new Error(`服务器响应错误: ${response.status}`);
        }
        
        // Get the blob and create download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Get filename from response headers or create one
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `缺勤学生名单_${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}.pdf`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showSuccess(`PDF生成成功！共 ${absentIds.length} 名学生`);
        
    } catch (error) {
        console.error('PDF生成错误:', error);
        showError(`生成PDF时出错: ${error.message}`);
        
        // Fallback to html2pdf if Flask backend fails
        showError('后端PDF生成失败，尝试使用备用方法...');
        setTimeout(() => {
            generateHTML2PDF(absentIds);
        }, 1000);
    }
}

// Fallback function using html2pdf (without photos)
function generateHTML2PDF(absentIds) {
    try {
        const now = new Date();
        const chineseDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
        document.getElementById('pdfDate').textContent = chineseDate;
        document.getElementById('pdfTotalCount').textContent = absentIds.length;
        
        const pdfStudentsList = document.getElementById('pdfStudentsList');
        pdfStudentsList.innerHTML = '';
        
        // Create student cards for PDF - without actual images
        absentIds.forEach((id, index) => {
            const name = studentData[id] || '未知学生';
            const photoNumber = getPhotoNumber(id);
            
            const studentDiv = document.createElement('div');
            studentDiv.style.cssText = `
                display: flex;
                align-items: center;
                margin-bottom: 20px;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 5px;
                background: #f9f9f9;
                page-break-inside: avoid;
            `;
            
            // Simple photo placeholder with number
            studentDiv.innerHTML = `
                <div style="width: 80px; height: 100px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); 
                           display: flex; align-items: center; justify-content: center; 
                           margin-right: 20px; border: 1px solid #ccc; border-radius: 3px;
                           flex-shrink: 0; font-size: 12px; text-align: center; padding: 5px; font-weight: bold;">
                    ${photoNumber ? `照片<br>${photoNumber}` : '无照片'}
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; color: #2c3e50;">
                        <span style="color: #666; font-size: 14px; margin-right: 5px;">${index + 1}.</span> ${name}
                    </div>
                    <div style="font-size: 14px; color: #666; margin-bottom: 5px;">学号: ${id}</div>
                    ${photoNumber ? `<div style="font-size: 12px; color: #777; background: #f0f0f0; padding: 3px 8px; border-radius: 3px; display: inline-block;">照片编号: ${photoNumber}</div>` : ''}
                </div>
            `;
            
            pdfStudentsList.appendChild(studentDiv);
        });
        
        // Generate PDF from HTML
        const element = document.getElementById('pdfContent');
        element.style.display = 'block';
        
        const opt = {
            margin: [15, 15, 15, 15],
            filename: `缺勤学生名单_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.pdf`,
            image: { 
                type: 'jpeg', 
                quality: 0.98 
            },
            html2canvas: { 
                scale: 2,
                useCORS: false,
                logging: false,
                letterRendering: true,
                backgroundColor: '#FFFFFF'
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait'
            }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
            console.log('PDF生成成功 (备用方法)');
            showSuccess(`PDF生成成功！共 ${absentIds.length} 名学生`);
        }).finally(() => {
            element.style.display = 'none';
        });
        
    } catch (error) {
        console.error('备用PDF生成错误:', error);
        showError('生成PDF时出错，请重试。');
        document.getElementById('pdfContent').style.display = 'none';
    }
}

function clearInput() {
    document.getElementById('absentIds').value = '';
    document.getElementById('idCount').textContent = '已输入 0 个学号';
    document.getElementById('preview').style.display = 'none';
    hideMessages();
}

function showSuccess(message) {
    hideMessages();
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `✅ ${message}`;
    successDiv.style.display = 'block';
    document.querySelector('.input-section').appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.style.opacity = '0';
        setTimeout(() => {
            successDiv.remove();
        }, 300);
    }, 3000);
}

function showError(message) {
    hideMessages();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `❌ ${message}`;
    errorDiv.style.display = 'block';
    document.querySelector('.input-section').appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.style.opacity = '0';
        setTimeout(() => {
            errorDiv.remove();
        }, 300);
    }, 5000);
}

function hideMessages() {
    const messages = document.querySelectorAll('.success-message, .error-message');
    messages.forEach(msg => {
        if (msg.parentNode) {
            msg.parentNode.removeChild(msg);
        }
    });
}

// Export functions for global access
window.generatePDF = generatePDF;
window.clearInput = clearInput;
window.showPreview = showPreview;
window.processInput = processInput;
