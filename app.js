var app = (function () {
    //-------------------------------MAIN API-----------------------------------
    var api = {
        tmp: true,
        collections: {},
        views: {},
        viewsObj: {
            Teams: [],
            UserListItemViews: [],
            TasksFilterGoalViewsItems: []
        },
        models: {},
        viewZone: {},
        templates: {},
        templatesDef: {},
        scripts: {},
        router: null,
        templateManager: null,
        scriptManager: null,
        collectionManager: null,
        initialize: function () {
            app.viewZone = $("body");
            app.viewZone.content = $("#content");

            app.collections.blueprintCategoriesCollection = new BlueprintCategoriesCollection();
            app.collections.blueprintProjectsCollection = new BlueprintProjectsCollection();
            app.collections.blueprintSubcategoriesCollection = new BlueprintSubcategoriesCollection();
            app.collections.blueprintTasksCollection = new BlueprintTasksCollection();
            app.collections.companiesCollection = new CompaniesCollection();
            app.collections.goalsCollection = new GoalsCollection();
            app.collections.learningDocsCollection = new LearningDocsCollection();
            app.collections.notificationsCollection = new NotificationsCollection();
            app.collections.projectsCollection = new ProjectsCollection();
            app.collections.roadmapsCollection = new RoadmapsCollection();
            app.collections.tasksCollection = new TasksCollection();
            app.collections.timelinesCollection = new TimelinesCollection();
            app.collections.usersCollection = new UsersCollection();


            window.Intercom("boot", {
                app_id: "eiczp0ck"
            })

        },
        timeoutWatcher: null,
        tokenWatcher: function (whithOutUpdate) {
            dfr = $.Deferred();
            var self = this;
            clearTimeout(this.timeoutWatcher);
            if (!whithOutUpdate) {
                self.checkToken()
                    .then(restart)
                    .fail(restart);
            } else {
                restart();
            }

            function restart() {
                self.timeoutWatcher = setTimeout(function () {
                    self.tokenWatcher();
                }, 60 * 1000);
                dfr.resolve();
            }

            return dfr.promise();
        },
        preloadCollections: function (forceFetch) {
            showLoadingAnimation();
            console.log((forceFetch === true ? 'Forced ' : '') + 'preload collections');
            var self = this,
                promises = [],
                collections = [
                    'blueprintCategoriesCollection',
                    'blueprintProjectsCollection',
                    'blueprintSubcategoriesCollection',
                    'blueprintTasksCollection',
                    'companiesCollection',
                    'goalsCollection',
                    'learningDocsCollection',
                    'notificationsCollection',
                    'projectsCollection',
                    'roadmapsCollection',
                    'tasksCollection',
                    'usersCollection'
                ],
                allDoneDfr = $.Deferred();

            collections.forEach(function (collection) {
                promises.push(app.collectionManager.loadCollection(collection, forceFetch));
            });


            $.when.apply($, promises).then(
                function () {
                    hideLoadingAnimation();
                    allDoneDfr.resolve();
                },
                function () {
                    hideLoadingAnimation();
                    allDoneDfr.reject();
                }
            );

            return allDoneDfr.promise();
        },
        checkToken: function () {
            var self = this,
                dfr = $.Deferred(),
                rememberMe = null,
                accessToken = false,
                decodedToken = null,
                refreshToken = null;

            accessToken = app.findToken('accessToken');

            //(поиск и проверка актуальности accessToken)
            if (accessToken) {
                //same1
                //если accessToken найден и актуален раскодируем его
                decodedToken = app.decodeJWT(accessToken);
                //Создаем объект юзер
                $.when(app.modelManager.loadModel('UserModel'))
                    .then(function () {
                        self.setUser(app, decodedToken);
                        app.prepareAjax();
                        dfr.resolve();
                    });
                //same1
            } else {
                self.updateTokens().done(function () {
                    app.prepareAjax();
                    dfr.resolve();
                }).fail(function () {
                    dfr.reject();
                });
            }
            return dfr.promise();
        },
        decodeJWT: function (token) {
            var base64Url = null,
                base64 = null;
            try {
                base64Url = token.split('.')[1],
                    base64 = base64Url.replace('-', '+').replace('_', '/');
            } catch (e) {

            } finally {
                return JSON.parse(window.atob(base64));
            }
        },
        findToken: function (tokenType) {
            var token = null;

            if (localStorage.hasOwnProperty(tokenType)) {
                token = localStorage.getItem(tokenType);
            } else if (sessionStorage.hasOwnProperty(tokenType)) {
                token = sessionStorage.getItem(tokenType);
            }
            if (token !== null && typeof token !== 'undefined' && app.checkTokenExp(token)) {
                return token;
            } else {
                return false;
            }
        },
        checkTokenExp: function (token) {
            var decodedToken = app.decodeJWT(token);
            return ((decodedToken.exp - 40) * 1000) > Date.now() ? true : false;
        },
        prepareAjax: function () {
            $.ajaxSetup({
                beforeSend: function (jqXHR, settings) {
                    jqXHR.setRequestHeader('Authorization', 'Bearer ' + app.findToken('accessToken'));
                    return true;
                },
                complete: function (jqXHR) {
                    //насколько я помню это когда меняется компания
                    if (!jqXHR.responseJSON && jqXHR.responseText[0] == '"') {
                        try { //responseText
                            jqXHR.responseJSON = JSON.parse(jqXHR.responseText.substr(1, jqXHR.responseText.length - 2));
                        } catch (e) {
                            console.log('Ops!');
                        }
                    }
                    if (jqXHR.responseJSON && jqXHR.responseJSON.code === 498 && app.tmp) {
                        debugger;
                        app.updateTokens();
                    } else if (jqXHR.status === 401) {
                        logoutFromAll();
                    }
                }
            });
        },
        setUser: function (app, decodedToken) {
            app.models.UserModel.set({
                id: decodedToken.data.user_id,
                first_name: decodedToken.data.first_name,
                last_name: decodedToken.data.last_name,
                email: decodedToken.data.email,
                current_company: decodedToken.data.current_company,
                url_avatar: decodedToken.data.url_avatar,
                user_hash: decodedToken.data.user_hash
            });
            $('body').removeClass('hidde-intercom')

        },
        updateTokens: function () {
            var self = this;
            app.tmp = false;
            var dfr = $.Deferred();
            console.log('Start update tokens');
            var rememberMe = null,
                refreshToken = null;
            //нужно обновить ассесс токен и рефреш токен. Для этого нужно
            //найти где они лежат (локал или сешн сторож) чтобы знать куда ложить
            //нужно их удалить оттуда и из объекта юзер
            if (sessionStorage.hasOwnProperty('accessToken') && sessionStorage.hasOwnProperty('refreshToken')) {
                rememberMe = false;
            } else if (localStorage.hasOwnProperty('accessToken') && localStorage.hasOwnProperty('refreshToken')) {
                rememberMe = true;
            }
            refreshToken = app.findToken('refreshToken');
            //запросить на сервере новый на базе старого или на базе кредентиалс

            if (!refreshToken) {
                //если refreshToken нет, чистим сессии и редирект на логин
                localStorage.clear();
                sessionStorage.clear();
                dfr.reject();
            } else {
                $.ajax({
                    url: '/auth/get-access-token',
                    method: 'post',
                    contentType: 'application/json; charset=utf-8',
                    dataType: 'json',
                    data: JSON.stringify({
                        refreshToken: refreshToken
                    }),
                    success: function (data, textStatus, jqXHR) {
                        //если пришел новый accessToken записываем его и резолвим промис
                        if (data.code === 200) {
                            if (rememberMe) {
                                localStorage.setItem('accessToken', data.tokens.accessToken);
                                localStorage.setItem('refreshToken', data.tokens.refreshToken);
                            } else {
                                sessionStorage.setItem('accessToken', data.tokens.accessToken);
                                sessionStorage.setItem('refreshToken', data.tokens.refreshToken);
                            }
                            //same3
                            var decodedToken = app.decodeJWT(data.tokens.accessToken);
                            $.when(app.modelManager.loadModel('UserModel'))
                                .done(function () {
                                    self.setUser(app, decodedToken);
                                    console.log('Update tokens success');
                                    app.prepareAjax();
                                    if (!isEmpty(api.collections)) {
                                        app.preloadCollections(true).done(function () {
                                            app.tmp = true;
                                            dfr.resolve();
                                            self.tokenWatcher(true);
                                        }).fail(
                                            function () {
                                                debugger;
                                            }
                                        );
                                    } else {
                                        dfr.resolve();
                                    }
                                });
                            //same3
                        } else {
                            debugger;
                            //если не пришел чистим сессии и редирект на логин
                            localStorage.clear();
                            sessionStorage.clear();
                            app.models.UserModel.clear({
                                silent: true
                            });
                            dfr.reject();
                        }
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        debugger;
                        //если не пришел чистим сессии и редирект на логин
                        localStorage.clear();
                        sessionStorage.clear();
                        app.models.UserModel.clear({
                            silent: true
                        });
                        dfr.reject();
                    }
                });
            }
            //нужно обновить и в случае неудачи при обновлении очистить все коллекции, которые зависят от роли и прав
            return dfr.promise();
        },

    };
    //-----------------------------ROUTER---------------------------------------
    var Router = Backbone.Router.extend({
        routes: {
            "": "auth",
            "auth(/:fragment)": "auth",
            "auth(/:token)": "auth",
            "goals(/:topGoalId)": "goals",
            "onboarding": "onboarding",
            "projects(/:topProjectId)": "projects",
            "resources": "resources",
            "roadmaps(/:stage)": "roadmap",
            "tasks": "tasks",
            "learning-center(/:category)": "learning",
            "timelines": "timelines",
            "team-management": "team",
            "notifications": "notifications",
            "notifications/:id": "notifications",
            "blueprints/:section(/:subsection)": "blueprints",
            "*notFound": "notFound"
        },
        route: function (route, name, callback) {
            var router = this;
            if (!callback) callback = this[name];

            var f = function () {
                if (app.findToken('accessToken') && app.models.UserModel) {

                    $('body').removeClass('hidde-intercom')
                } else {
                    $('body').addClass('hidde-intercom')
                }

                if(Backbone.history.fragment == 'onboarding'){
                    $('#intercom-container').hide()
                } else {
                    $('#intercom-container').show()
                }
                console.log('route before', route);
                var parent_arguments = arguments
                app.checkToken()
                    .done(
                        function () {
                            app.preloadCollections().done(function () {
                                callback.apply(router, parent_arguments);
                                console.log('route after', route);
                            });
                        }
                    )
                    .fail(function () {
                        callback = router.auth;
                        callback.apply(router, parent_arguments);
                        console.log('route after', route);
                    });
            };
            return Backbone.Router.prototype.route.call(this, route, name, f);
        },
        saveManage: function (route) {
            localStorage.setItem('lastManage', route);
        },
        auth: function (fragment) {
            var dfrAuthView = $.Deferred(),
                AuthModel = Backbone.Model.extend({
                    defaults: {
                        invite: false
                    }
                });

            //Init views
            app.viewsObj.AuthView = new AuthView({
                dfr: dfrAuthView,
                model: new AuthModel(),
                fragment: fragment
            });
            //End init views

            //Render views
            dfrAuthView.done(function () {
                //AuthView
                $('header').remove();
                $('footer').remove();
                app.viewZone.content.empty().append(app.viewsObj.AuthView.render().$el);
            });
            //End Render views
        },
        learning: function (category) {
            var dfrLearning = $.Deferred(),
                dfrHeaderView = $.Deferred();

            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            $('footer').remove();


            //Init views
            app.viewsObj.LearningView = new LearningView({
                dfr: dfrLearning,
                category: category
            });
            //End init views

            //Render views

            $.when(
                dfrHeaderView.promise(),
                dfrLearning.promise()
            )
                .done(function () {
                    app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));

                    app.viewZone.content.empty().append(app.viewsObj.LearningView.render().$el);

                    hideLoadingAnimation();
                });
            //End Render views
        },
        goals: function (topGoalId) {
            this.saveManage('goals');
            var dfrHeaderView = $.Deferred(),
                dfrGoalListView = $.Deferred(),
                dfrFooterView = $.Deferred();

            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            app.viewsObj.GoalListView = new GoalListView({
                dfr: dfrGoalListView
            });
            app.viewsObj.FooterView = new FooterView({
                dfr: dfrFooterView
            });
            //End init views

            //Render views
            $.when(
                dfrHeaderView.promise(),
                dfrGoalListView.promise(),
                dfrFooterView.promise()
            ).then(function () {
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));
                //GoalListView
                if (topGoalId) {
                    app.models.GoalListModel.set({
                        topGoalId: topGoalId
                    });
                }
                app.viewZone.content.empty().append(app.viewsObj.GoalListView.render().$el);
                //FooterView
                app.models.FooterModel.set({
                    itemName: 'goal',
                    newItemButtonText: 'new goal'
                });
                app.models.HeaderModel.set({
                    itemName: 'goal',
                    newItemButtonText: 'new goal'
                });
                if (!window.matchMedia("(max-width: 568px)").matches)
                    app.viewsObj.FooterView.render().$el.insertAfter($('section'));
                hideLoadingAnimation();
            });
            //End render views
        },
        onboarding: function () {
            var dfrOnboardingView = $.Deferred();

            //Init views
            app.viewsObj.OnboardingView = new OnboardingView({
                dfr: dfrOnboardingView
            });
            //End init views

            //Render views
            dfrOnboardingView.done(function () {
                //AuthView
                $('header').remove();
                $('footer').remove();
                app.viewZone.content.empty().append(app.viewsObj.OnboardingView.render().$el);
            });
            //End Render views
        },
        projects: function (topProjectId) {
            this.saveManage('projects');
            var dfrGoalNameFilterView = $.Deferred(),
                dfrProjectListView = $.Deferred(),
                dfrHeaderView = $.Deferred(),
                dfrFooterView = $.Deferred();

            //Init views
            //header
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            //GoalNameFilterView
            app.viewsObj.GoalNameFilterView = new GoalNameFilterView({
                dfr: dfrGoalNameFilterView
            });
            //ProjectListView
            app.viewsObj.ProjectListView = new ProjectListView({
                dfr: dfrProjectListView
            });
            //FooterView
            app.viewsObj.FooterView = new FooterView({
                dfr: dfrFooterView
            });
            //End init views

            //Render views
            $.when(
                dfrGoalNameFilterView.promise(),
                dfrProjectListView.promise(),
                dfrHeaderView.promise(),
                dfrFooterView.promise()
            ).then(function () {
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));
                //GoalNameFilterView
                app.viewZone.content.empty().html('<div class="projectsPageFiltersZone"></div>');
                app.viewZone.content.find('.projectsPageFiltersZone').append(app.viewsObj.GoalNameFilterView.render().$el);
                //ProjectListModel
                if (topProjectId) {
                    app.models.ProjectListModel.set({
                        topProjectId: topProjectId
                    });
                }
                app.viewZone.content.append(app.viewsObj.ProjectListView.render().$el);
                //FooterView
                app.models.FooterModel.set({
                    isNewItemButtonEnabled: true,
                    itemName: 'project',
                    newItemButtonText: 'new project'
                });
                app.models.HeaderModel.set({
                    isNewItemButtonEnabled: true,
                    itemName: 'project',
                    newItemButtonText: 'new project'
                });
                if (!window.matchMedia("(max-width: 568px)").matches)
                    app.viewsObj.FooterView.render().$el.insertAfter($('section'));
            });
            //End Render views
        },
        resources: function () {
            var dfrHeaderView = $.Deferred(),
                dfrResourcesView = $.Deferred();

            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            app.viewsObj.ResourcesView = new ResourcesView({
                dfr: dfrResourcesView
            });
            //End init views

            //Render views
            $.when(
                dfrHeaderView.promise(),
                dfrResourcesView.promise()
            ).then(function () {
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));
                //ResourcesView
                app.viewZone.content.empty().append(app.viewsObj.ResourcesView.render().$el);
            }, function () {
                console.error(arguments);
            });
            //End render views
        },
        roadmap: function (stage) {
            var dfrHeaderView = $.Deferred(),
                dfrRoadmapView = $.Deferred();

            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            app.viewsObj.RoadmapView = new RoadmapView({
                dfr: dfrRoadmapView,
                stage: stage
            });
            //End init views

            //Render views
            $.when(
                dfrHeaderView.promise(),
                dfrRoadmapView.promise()
            ).then(function () {
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));
                //ResourcesView
                app.viewZone.content.empty().append(app.viewsObj.RoadmapView.render().$el);
            }, function () {
                console.error(arguments);
            });
            //End render views
        },
        tasks: function () {
            this.saveManage('tasks');
            var self = this,
                dfrHeaderView = $.Deferred(),
                dfrFilterTasksByGoalsAndProjectsView = $.Deferred(),
                dfrFilterCompletedTasksView = $.Deferred(),
                dfrFilterTasksByDateView = $.Deferred(),
                dfrFilterTasksByOwnersView = $.Deferred(),
                dfrTasksPaginatorView = $.Deferred(),
                dfrTaskListView = $.Deferred(),
                dfrFooterView = $.Deferred();

            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView,
                isNewItemButtonEnabled: true,
                itemName: 'project',
                newItemButtonText: 'new project'
            });
            app.viewsObj.FilterTasksByGoalsAndProjectsView = new FilterTasksByGoalsAndProjectsView({
                dfr: dfrFilterTasksByGoalsAndProjectsView
            });
            app.viewsObj.FilterCompletedTasksView = new FilterCompletedTasksView({
                dfr: dfrFilterCompletedTasksView
            });
            app.viewsObj.FilterTasksByDateView = new FilterTasksByDateView({
                dfr: dfrFilterTasksByDateView
            });
            app.viewsObj.FilterTasksByOwnersView = new FilterTasksByOwnersView({
                dfr: dfrFilterTasksByOwnersView
            });
            app.viewsObj.TasksPaginatorView = new TasksPaginatorView({
                dfr: dfrTasksPaginatorView
            });
            app.viewsObj.TaskListView = new TaskListView({
                dfr: dfrTaskListView
            });
            app.viewsObj.FooterView = new FooterView({
                dfr: dfrFooterView
            });
            //End init views

            //Render views
            $.when(
                dfrHeaderView.promise(),
                dfrFilterTasksByGoalsAndProjectsView.promise(),
                dfrFilterCompletedTasksView.promise(),
                dfrFilterTasksByDateView.promise(),
                dfrFilterTasksByOwnersView.promise(),
                dfrTasksPaginatorView.promise(),
                dfrTaskListView.promise(),
                dfrFooterView.promise()
            ).then(function () {
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));

                //FilterByGoal&projectName, completed tasks filter
                app.viewZone.content.empty().append('<div id="filtersZone"></div>');
                app.viewZone.content.find('#filtersZone').append(app.viewsObj.FilterTasksByGoalsAndProjectsView.render().$el);
                app.viewZone.content.find('#filtersZone').append(app.viewsObj.FilterCompletedTasksView.render().$el);
                app.viewZone.content.find('#filtersZone').append(app.viewsObj.FilterTasksByDateView.render().$el);
                // app.viewZone.content.find('#filtersZone').append(app.viewsObj.FilterTasksByOwnersView.render().$el);


                //TaskListView
                app.viewZone.content.append(app.viewsObj.TaskListView.render().$el);

                //Paginator
                app.viewZone.content.append(app.viewsObj.TasksPaginatorView.render().$el);

                //FooterView
                app.models.FooterModel.set({
                    isNewItemButtonEnabled: true,
                    itemName: 'task',
                    newItemButtonText: 'new task'
                });
                app.models.HeaderModel.set({
                    isNewItemButtonEnabled: true,
                    itemName: 'task',
                    newItemButtonText: 'new task'
                });
                if (!window.matchMedia("(max-width: 568px)").matches)
                    app.viewsObj.FooterView.render().$el.insertAfter($('section'));
            });
            //End render views
        },
        timelines: function () {
            var dfrHeaderView = $.Deferred(),
                dfrTimelineListView = $.Deferred();

            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            app.viewsObj.TimelineListView = new TimelineListView({
                dfr: dfrTimelineListView
            });
            //End init views

            //Render views
            $.when(
                dfrHeaderView.promise(),
                dfrTimelineListView.promise()
            ).then(function () {
                $('footer').remove();
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));
                //TimelineListView
                app.viewZone.content.empty().append(app.viewsObj.TimelineListView.render().$el);
                setTimeout(function () {
                    app.collections.timelinesCollection.forEach(function (timelineModel) {
                        timelineModel.get('timeline').moveTo(new Date());
                    });
                }, 0);
            });
            //End render views
        },
        notifications: function (id) {
            var dfrHeaderView = $.Deferred(),
                dfrNotificationListView = $.Deferred();

            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            app.viewsObj.NotificationListView = new NotificationListView({
                dfr: dfrNotificationListView
            });
            //End init views

            //Render views
            $.when(
                dfrHeaderView.promise(),
                dfrNotificationListView.promise()
            ).then(function () {
                $('footer').remove();
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));
                app.viewZone.content.empty().append(app.viewsObj.NotificationListView.render().$el);
            });
            //End render views
        },
        blueprints: function () {
            var dfrHeaderView = $.Deferred(),
                dfrBlueprintsListView = $.Deferred(),
                //prepare data for BlueprintListView
                categoryId = app.collections.blueprintCategoriesCollection.iwhere('name', Backbone.history.fragment.split('/')[1])[0].id,
                name = app.collections.blueprintCategoriesCollection.iwhere('name', Backbone.history.fragment.split('/')[1])[0].attributes.name,
                color = app.collections.blueprintCategoriesCollection.iwhere('name', Backbone.history.fragment.split('/')[1])[0].attributes.color,

                subcategoryName = Backbone.history.fragment.split('/')[2],
                blueprintsModelsArray = null,
                viewedBlueprintsCollection = [];
            if (typeof subcategoryName === 'undefined') {
                app.collections.blueprintSubcategoriesCollection.where({
                    category_id: categoryId
                }).forEach(function (subcategoryModel) {
                    blueprintsModelsArray = app.collections.blueprintProjectsCollection.where({
                        subcategory_id: subcategoryModel.id
                    });
                    if (blueprintsModelsArray.length > 0) {
                        viewedBlueprintsCollection = viewedBlueprintsCollection.concat(blueprintsModelsArray);
                    }
                });
            } else {
                blueprintsModelsArray = app.collections.blueprintProjectsCollection.where({
                    subcategory_id: app.collections.blueprintSubcategoriesCollection.iwhere('name', subcategoryName)[0].id

                });
                if (blueprintsModelsArray.length > 0) {
                    viewedBlueprintsCollection = viewedBlueprintsCollection.concat(blueprintsModelsArray);
                }
                name = app.collections.blueprintSubcategoriesCollection.iwhere('name', subcategoryName)[0].attributes.name

            }
            //end prepare data for BlueprintListView
            //Init views
            app.viewsObj.HeaderView = new HeaderView({
                dfr: dfrHeaderView
            });
            app.viewsObj.BlueprintListView = new BlueprintListView({
                dfr: dfrBlueprintsListView,
                name: name,
                color: color,
                collection: viewedBlueprintsCollection
            });
            //End init views
            //Render views
            $.when(
                dfrHeaderView.promise(),
                dfrBlueprintsListView.promise()
            ).then(function () {
                $('footer').remove();
                //HeaderView
                app.viewsObj.HeaderView.delegateEvents().render().$el.insertBefore($('section'));
                //BlueprintListView
                app.viewZone.content.empty().append(app.viewsObj.BlueprintListView.render().$el);
            });
            //End render views
        },
        notFound: function () {
            console.log('notFound');
        }
    });
    api.router = new Router();
    //----------------------------TEMPLATE MANAGER----------------------------------
    var templateManager = function () {
        return {
            getTemplate: function (url) {
                var dfr = $.Deferred();
                if (app.templates[url]) {
                    dfr.resolve();
                } else if (app.templatesDef[url]) {
                    app.templatesDef[url].promise()
                        .then(function () {
                            dfr.resolve();
                        })
                } else {
                    app.templatesDef[url] = dfr;
                    $.get(url, function (data) {
                        app.templates[url] = _.template(data);
                        dfr.resolve();
                    });
                }
                return dfr.promise();
            }
        };
    };
    api.templateManager = new templateManager();
    //----------------------------SCRIPT MANAGER--------------------------------
    var scriptManager = function () {
        return {
            getScript: function (url) {
                var dfr = $.Deferred();
                if (app.scripts[url]) {
                    dfr.resolve();
                } else {
                    $.ajaxSetup({
                        cache: true
                    });
                    $.getScript(
                        url,
                        function () {
                            app.scripts[url] = true;
                            dfr.resolve();
                            $.ajaxSetup({
                                cache: false
                            });
                        }
                    );
                }
                return dfr.promise();
            }
        };
    };
    api.scriptManager = new scriptManager();
    //------------------------COLLECTION MANAGER--------------------------------
    api.collectionManager = (function () {
        var orderedCollections = {};
        return {
            loadCollection: function (name, forceFetch) {
                if (typeof(orderedCollections[name]) === 'undefined' || (typeof forceFetch !== 'undefined' && forceFetch === true)) {
                    var dfr = $.Deferred();
                    var params = {};
                    orderedCollections[name] = dfr.promise();
                    var method = 'GET';
                    switch (name) {
                        case 'blueprintCategoriesCollection':
                        case 'blueprintProjectsCollection':
                        case 'blueprintSubcategoriesCollection':
                        case 'blueprintTasksCollection':
                        case 'roadmapsCollection':
                        case 'learningDocsCollection': {
                            break;
                        }
                        case 'commentsCollection':
                        case 'companiesCollection':
                        case 'goalsCollection':
                        case 'notificationsCollection':
                        case 'projectsCollection':
                        case 'tasksCollection':
                        case 'usersCollection': {
                            method = 'POST';
                            break;
                        }
                        default: {
                            console.log("Endpoint for " + name + " collection doesn't exist.");
                            return dfr.reject();
                        }

                    }
                    api.collections[name].fetch({
                        type: method,
                        success: function (collection, response, options) {
                            api.collections[name].trigger('mysync');
                            api.collections[name].set(response);
                            dfr.resolve();
                        },
                        error: function (collection, response, options) {
                            console.log({
                                errorMessage: response.responseText
                            });
                            dfr.reject();
                        }
                    });
                    return orderedCollections[name];
                } else {
                    return orderedCollections[name];
                }
            }
        }
    })();
    //------------------------MODEL MANAGER-------------------------------------
    var modelManager = function () {
        return {
            loadModel: function (name) {
                //is this model already loaded?
                if (typeof(app.models[name]) != 'undefined') {
                    var dfr = $.Deferred();
                    dfr.resolve();
                    return dfr.promise();
                } else {
                    var fn = window[name];
                    if (typeof fn === "function") {
                        app.models[name] = new fn();
                    }
                }
            }
        };
    };
    api.modelManager = new modelManager();

    ////////////////////////////GLOBAL FUNCTIONS////////////////////////////////

    function mobileDevice() {
        if (window.screen.availWidth < 768 && (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0, 4)))) {
            hideLoadingAnimation();
            app.templateManager.getTemplate('/app/templates/mobileDevice.tpl')
                .pipe(function () {
                    app.viewZone.content.append(app.templates['/app/templates/mobileDevice.tpl']);
                });
            return true;
        } else
            return true;
    }

    ////////////////////////////////////////////////////////////////////////////
    api.utils = {
        previewText: function (html, l) {
            var tmp = document.createElement("DIV");
            tmp.innerHTML = html;
            return (tmp.textContent || tmp.innerText || "").trim().substr(0, l || 300) + ' ...';
        },
    }

    return api;


})();
function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}