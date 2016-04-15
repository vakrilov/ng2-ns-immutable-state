import {bootstrap} from 'angular2/platform/browser';
import {Component, OpaqueToken, provide, Inject, Input, Output, EventEmitter, enableProdMode} from 'angular2/core';

import {Observable} from 'rxjs/Observable';
import {Observer} from 'rxjs/Observer';
import {Subject} from 'rxjs/Subject';
import {BehaviorSubject} from 'rxjs/subject/BehaviorSubject';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/scan';
import 'rxjs/add/operator/zip';

// -- state
interface Todo { id: number; text: string; completed: boolean; }
interface AppState { todos: Todo[]; visibilityFilter: string; }

// -- actions
class AddTodoAction { constructor(public todoId: number, public text: string) { } }
class ToggleTodoAction { constructor(public id: number) { } }
class SetVisibilityFilter { constructor(public filter: string) { } }
type Action = AddTodoAction | ToggleTodoAction | SetVisibilityFilter;

function getVisibleTodos(todos: Todo[], filter: string): Todo[] {
    return todos.filter(t => {
        if (filter === "SHOW_ACTIVE") return !t.completed;
        if (filter === "SHOW_COMPLETED") return t.completed;
        return true;
    });
}

// -- statefn
function todos(initState: Todo[], actions: Observable<Action>): Observable<Todo[]> {
    return actions.scan((state, action) => {
        if (action instanceof AddTodoAction) {
            const newTodo = { id: action.todoId, text: action.text, completed: false };
            return [...state, newTodo];
        } else {
            return state.map(t => updateTodo(t, action));
        }
    }, initState);
}

function updateTodo(todo: Todo, action: Action): Todo {
    if (action instanceof ToggleTodoAction && action.id === todo.id) {
        return Object.assign({}, todo, { completed: !todo.completed });
    } else {
        return todo;
    }
}

function filter(initState: string, actions: Observable<Action>): Observable<string> {
    return actions.scan((state, action) => {
        if (action instanceof SetVisibilityFilter) {
            return action.filter;
        } else {
            return state;
        }
    }, initState);
}

function stateFn(initState: AppState, actions: Observable<Action>): Observable<AppState> {
    const combine = s => ({ todos: s[0], visibilityFilter: s[1] });

    const appStateObs: Observable<AppState> =
        todos(initState.todos, actions).
            zip(filter(initState.visibilityFilter, actions)).
            map(combine);
    return wrapIntoBehavior(initState, appStateObs);
}

function wrapIntoBehavior(init, obs) {
    const res = new BehaviorSubject(init);
    obs.subscribe(s => res.next(s));
    return res;
}

// -- DI config
const initState = new OpaqueToken("initState");
const dispatcher = new OpaqueToken("dispatcher");
const state = new OpaqueToken("state");

const stateAndDispatcher = [
    provide(initState, { useValue: { todos: [], visibilityFilter: 'SHOW_ALL' } }),
    provide(dispatcher, { useValue: new Subject<Action>(null) }),
    provide(state, { useFactory: stateFn, deps: [new Inject(initState), new Inject(dispatcher)] })
];

// -- Components
@Component({
    selector: 'todo',
    template: `
    <GridLayout verticalAlignment="top" horizontalAlignment="left" class="todo">
        <Label (tap)="toggle.next()" [class.completed]="completed" [text]="text"></Label>
        <StackLayout class="line" *ngIf="completed"></StackLayout>
    </GridLayout>
    `
})
class TodoComponent {
    @Input() text: string;
    @Input() completed: boolean;
    @Output() toggle = new EventEmitter();
}

@Component({
    selector: 'todo-list',
    template: `<todo *ngFor="#t of filtered|async"
                [text]="t.text" [completed]="t.completed"
                (toggle)="emitToggle(t.id)"></todo>`,
    directives: [TodoComponent]
})
class TodoList {
    constructor( @Inject(dispatcher) private dispatcher: Observer<Action>,
        @Inject(state) private state: Observable<AppState>) { }

    get filtered() { return this.state.map(s => getVisibleTodos(s.todos, s.visibilityFilter)); }

    emitToggle(id) { this.dispatcher.next(new ToggleTodoAction(id)); }
}

var nextId = 0;
@Component({
    selector: 'add-todo',
    template: `
  <GridLayout columns="*, auto" rows="auto">
    <TextField #text></TextField>
    <Button (tap)="addTodo(text.text)" text="Add Todo" col="1"></Button>
  </GridLayout>`
})
class AddTodo {
    constructor( @Inject(dispatcher) private dispatcher: Observer<Action>) { }
    addTodo(value) { this.dispatcher.next(new AddTodoAction(nextId++, value)); }
}

@Component({
    selector: 'filter-link',
    template: `
    <Label (tap)="setVisibilityFilter()"
        class="filter"
        [class.selected]="selected|async" 
        [text]="text"></Label>`
})
class FilterLink {
    @Input() filter: string;
    @Input() text: string;
    constructor( @Inject(dispatcher) private dispatcher: Observer<Action>,
        @Inject(state) private state: Observable<AppState>) { }

    get selected() { return this.state.map(s => s.visibilityFilter === this.filter); }

    setVisibilityFilter() { this.dispatcher.next(new SetVisibilityFilter(this.filter)); }
}

@Component({
    selector: 'footer',
    template: `
    <StackLayout orientation="horizontal">
        <filter-link filter="SHOW_ALL" text="All"></filter-link>
        <filter-link filter="SHOW_ACTIVE"  text="Active"></filter-link>
        <filter-link filter="SHOW_COMPLETED"  text="Completed"></filter-link>
    </StackLayout>`,
    directives: [FilterLink]
})
class Footer { }

@Component({
    selector: 'ng-demo',
    template: `
  <StackLayout>
    <add-todo></add-todo>
    <todo-list></todo-list>
    <footer></footer>
  </StackLayout>    
  `,
    directives: [AddTodo, TodoList, Footer],
    providers: stateAndDispatcher
})
export class TodoApp { }