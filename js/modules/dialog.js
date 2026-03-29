// class Modal {
//     constructor() {
//         this.container = null;
//         this.currentResolve = null;
//         this.init();
//     }

//     init() {
//         let container = document.getElementById('global-modal');
//         if (!container) {
//             const modalHTML = `
//                 <div id="global-modal" class="modal-overlay hidden">
//                     <div class="modal-container">
//                         <button class="modal-close" aria-label="Закрыть">&times;</button>
//                         <div class="modal-header">
//                             <h3 id="modal-title">Заголовок</h3>
//                         </div>
//                         <div class="modal-body">
//                             <p id="modal-message">Сообщение</p>
//                             <div id="modal-input-area" style="display: none;">
//                                 <input type="text" id="modal-input" class="modal-input" placeholder="Введите значение">
//                             </div>
//                             <div id="modal-list-area" style="display: none;">
//                                 <ul id="modal-list" class="modal-list"></ul>
//                             </div>
//                         </div>
//                         <div class="modal-buttons">
//                             <button id="modal-ok" class="modal-btn modal-btn-primary">OK</button>
//                             <button id="modal-cancel" class="modal-btn modal-btn-secondary">Отмена</button>
//                         </div>
//                     </div>
//                 </div>
//             `;
//             document.body.insertAdjacentHTML('beforeend', modalHTML);
//             container = document.getElementById('global-modal');
//         }
//         this.container = container;
//         this.bindEvents();
//     }

//     bindEvents() {
//         if (this.container._bound) return;

//         const closeBtn = this.container.querySelector('.modal-close');
//         const overlay = this.container;
//         const okBtn = this.container.querySelector('#modal-ok');
//         const cancelBtn = this.container.querySelector('#modal-cancel');

//         const close = () => this.hide();
//         closeBtn.addEventListener('click', close);
//         overlay.addEventListener('click', (e) => {
//             if (e.target === overlay) close();
//         });
//         okBtn.addEventListener('click', () => this.resolve(true));
//         cancelBtn.addEventListener('click', () => this.resolve(false));

//         document.addEventListener('keydown', (e) => {
//             if (!this.container.classList.contains('hidden')) {
//                 if (e.key === 'Escape') this.resolve(false);
//                 if (e.key === 'Enter' && this.container.querySelector('#modal-ok').style.display !== 'none') {
//                     e.preventDefault();
//                     this.resolve(true);
//                 }
//             }
//         });

//         this.container._bound = true;
//     }

//     show(options) {
//         return new Promise((resolve) => {
//             this.currentResolve = resolve;
//             const titleEl = this.container.querySelector('#modal-title');
//             const messageEl = this.container.querySelector('#modal-message');
//             const inputArea = this.container.querySelector('#modal-input-area');
//             const listArea = this.container.querySelector('#modal-list-area');
//             const input = this.container.querySelector('#modal-input');
//             const list = this.container.querySelector('#modal-list');
//             const okBtn = this.container.querySelector('#modal-ok');
//             const cancelBtn = this.container.querySelector('#modal-cancel');

//             // Сброс состояния
//             inputArea.style.display = 'none';
//             listArea.style.display = 'none';
//             input.value = '';
//             list.innerHTML = '';
//             okBtn.style.display = '';
//             cancelBtn.style.display = '';

//             titleEl.textContent = options.title || 'Подтверждение';
//             messageEl.textContent = options.message || '';

//             if (options.type === 'prompt') {
//                 inputArea.style.display = 'block';
//                 if (options.defaultValue) input.value = options.defaultValue;
//                 input.placeholder = options.placeholder || '';
//                 okBtn.textContent = options.okText || 'OK';
//                 cancelBtn.textContent = options.cancelText || 'Отмена';
//                 setTimeout(() => input.focus(), 100);
//             } 
//             else if (options.type === 'confirm') {
//                 okBtn.textContent = options.okText || 'Да';
//                 cancelBtn.textContent = options.cancelText || 'Нет';
//             }
//             else if (options.type === 'alert') {
//                 cancelBtn.style.display = 'none';
//                 okBtn.textContent = options.okText || 'OK';
//             }
//             else if (options.type === 'select') {
//                 listArea.style.display = 'block';
//                 options.items.forEach((item) => {
//                     const li = document.createElement('li');
//                     li.textContent = item.label || item;
//                     li.dataset.value = item.value !== undefined ? item.value : item;
//                     li.addEventListener('click', () => {
//                         this.resolve(li.dataset.value);
//                         this.hide();
//                     });
//                     list.appendChild(li);
//                 });
//                 okBtn.style.display = 'none';
//                 cancelBtn.textContent = options.cancelText || 'Отмена';
//             }

//             this.container.classList.remove('hidden');
//         });
//     }

//     resolve(value) {
//         if (this.currentResolve) {
//             const input = this.container.querySelector('#modal-input');
//             if (input && input.parentElement.style.display !== 'none') {
//                 this.currentResolve(value ? input.value : null);
//             } else {
//                 this.currentResolve(value);
//             }
//             this.currentResolve = null;
//         }
//         this.hide();
//     }

//     hide() {
//         this.container.classList.add('hidden');
//     }

//     static async alert(message, title = 'Уведомление') {
//         const modal = new Modal();
//         return modal.show({ type: 'alert', message, title });
//     }

//     static async confirm(message, title = 'Подтверждение') {
//         const modal = new Modal();
//         return modal.show({ type: 'confirm', message, title });
//     }

//     static async prompt(message, defaultValue = '', placeholder = '', title = 'Ввод') {
//         const modal = new Modal();
//         return modal.show({ type: 'prompt', message, defaultValue, placeholder, title });
//     }

//     static async select(items, title = 'Выберите вариант') {
//         const modal = new Modal();
//         return modal.show({ type: 'select', items, title });
//     }
// }




class Modal {
    // Статическое свойство для хранения единственного экземпляра
    static instance = null;

    constructor() {
        // Если экземпляр уже есть, возвращаем его вместо создания нового
        if (Modal.instance) {
            return Modal.instance;
        }

        this.container = null;
        this.currentResolve = null;
        this.init();

        // Сохраняем экземпляр
        Modal.instance = this;
    }

    init() {
        let container = document.getElementById('global-modal');
        if (!container) {
            const modalHTML = `
                <div id="global-modal" class="modal-overlay hidden">
                    <div class="modal-container">
                        <button class="modal-close" aria-label="Закрыть">&times;</button>
                        <div class="modal-header">
                            <h3 id="modal-title">Заголовок</h3>
                        </div>
                        <div class="modal-body">
                            <p id="modal-message">Сообщение</p>
                            <div id="modal-input-area" style="display: none;">
                                <input type="text" id="modal-input" class="modal-input" placeholder="Введите значение">
                            </div>
                            <div id="modal-list-area" style="display: none;">
                                <ul id="modal-list" class="modal-list"></ul>
                            </div>
                        </div>
                        <div class="modal-buttons">
                            <button id="modal-ok" class="modal-btn modal-btn-primary">OK</button>
                            <button id="modal-cancel" class="modal-btn modal-btn-secondary">Отмена</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            container = document.getElementById('global-modal');
        }
        this.container = container;
        this.bindEvents();
    }

    bindEvents() {
        // Проверка, чтобы не вешать события дважды
        if (this.container._bound) return;

        const closeBtn = this.container.querySelector('.modal-close');
        const okBtn = this.container.querySelector('#modal-ok');
        const cancelBtn = this.container.querySelector('#modal-cancel');

        const closeAction = () => this.resolve(null); // Закрытие = отмена

        // Навешиваем события один раз на всё время работы приложения
        closeBtn.addEventListener('click', closeAction);
        
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) closeAction();
        });

        okBtn.addEventListener('click', () => this.resolve(true));
        cancelBtn.addEventListener('click', () => this.resolve(false));

        document.addEventListener('keydown', (e) => {
            // Работает только если модалка видна
            if (!this.container.classList.contains('hidden')) {
                if (e.key === 'Escape') this.resolve(false);
                if (e.key === 'Enter') {
                    const okBtnStyle = window.getComputedStyle(okBtn).display;
                    if (okBtnStyle !== 'none') {
                        e.preventDefault();
                        this.resolve(true);
                    }
                }
            }
        });

        this.container._bound = true;
    }

    show(options) {
        return new Promise((resolve) => {
            this.currentResolve = resolve;
            
            const titleEl = this.container.querySelector('#modal-title');
            const messageEl = this.container.querySelector('#modal-message');
            const inputArea = this.container.querySelector('#modal-input-area');
            const listArea = this.container.querySelector('#modal-list-area');
            const input = this.container.querySelector('#modal-input');
            const list = this.container.querySelector('#modal-list');
            const okBtn = this.container.querySelector('#modal-ok');
            const cancelBtn = this.container.querySelector('#modal-cancel');

            // Сброс состояния перед показом
            inputArea.style.display = 'none';
            listArea.style.display = 'none';
            input.value = '';
            list.innerHTML = '';
            okBtn.style.display = '';
            cancelBtn.style.display = '';

            titleEl.textContent = options.title || 'Подтверждение';
            messageEl.textContent = options.message || '';

            if (options.type === 'prompt') {
                inputArea.style.display = 'block';
                if (options.defaultValue) input.value = options.defaultValue;
                input.placeholder = options.placeholder || '';
                okBtn.textContent = options.okText || 'OK';
                cancelBtn.textContent = options.cancelText || 'Отмена';
                setTimeout(() => input.focus(), 100);
            } 
            else if (options.type === 'confirm') {
                okBtn.textContent = options.okText || 'Да';
                cancelBtn.textContent = options.cancelText || 'Нет';
            }
            else if (options.type === 'alert') {
                cancelBtn.style.display = 'none';
                okBtn.textContent = options.okText || 'OK';
            }
            else if (options.type === 'select') {
                listArea.style.display = 'block';
                okBtn.style.display = 'none';
                options.items.forEach((item) => {
                    const li = document.createElement('li');
                    li.textContent = item.label || item;
                    const val = item.value !== undefined ? item.value : item;
                    li.addEventListener('click', () => {
                        this.resolve(val);
                    });
                    list.appendChild(li);
                });
            }

            this.container.classList.remove('hidden');
        });
    }

    resolve(value) {
        if (this.currentResolve) {
            const input = this.container.querySelector('#modal-input');
            const isPrompt = input && input.parentElement.style.display !== 'none';
            
            let result;
            if (value === null || value === false) {
                result = null; // Отмена
            } else if (isPrompt) {
                result = input.value; // Возвращаем текст из инпута
            } else {
                result = value; // Возвращаем true или значение из списка
            }

            const resolveFn = this.currentResolve;
            this.currentResolve = null; // Очищаем ПЕРЕД вызовом, чтобы избежать циклов
            this.hide();
            resolveFn(result);
        }
    }

    hide() {
        this.container.classList.add('hidden');
    }

    // Статические методы используют один и тот же экземпляр
    static get instanceRef() {
        return Modal.instance || new Modal();
    }

    static async alert(message, title) {
        return this.instanceRef.show({ type: 'alert', message, title });
    }

    static async confirm(message, title) {
        return this.instanceRef.show({ type: 'confirm', message, title });
    }

    static async prompt(message, defaultValue, placeholder, title) {
        return this.instanceRef.show({ type: 'prompt', message, defaultValue, placeholder, title });
    }

    static async select(items, title) {
        return this.instanceRef.show({ type: 'select', items, title });
    }
}
