pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'docker.io'
        DOCKER_IMAGE_BACKEND = "${DOCKER_REGISTRY}/YOUR_USERNAME/lab-booking-backend:${BUILD_NUMBER}"
        DOCKER_IMAGE_FRONTEND = "${DOCKER_REGISTRY}/YOUR_USERNAME/lab-booking-frontend:${BUILD_NUMBER}"
        DOCKER_IMAGE_DB = "${DOCKER_REGISTRY}/YOUR_USERNAME/lab-booking-db:${BUILD_NUMBER}"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                }
            }
        }

        stage('Install Dependencies') {
            parallel {
                stage('Backend Dependencies') {
                    steps {
                        dir('backend') {
                            sh 'npm ci'
                        }
                    }
                }
                stage('Frontend Dependencies') {
                    steps {
                        dir('frontend') {
                            sh 'npm ci'
                        }
                    }
                }
            }
        }

        stage('Build') {
            parallel {
                stage('Build Backend') {
                    steps {
                        dir('backend') {
                            sh 'npm run build'
                        }
                    }
                }
                stage('Build Frontend') {
                    steps {
                        dir('frontend') {
                            sh 'npm run build'
                        }
                    }
                }
            }
        }

        stage('Unit Tests') {
            parallel {
                stage('Backend Tests') {
                    steps {
                        dir('backend') {
                            sh 'npm test -- --coverage --reporter=junit --outputFile=test-results.xml'
                        }
                    }
                    post {
                        always {
                            junit 'backend/test-results.xml'
                            publishHTML(target: [
                                allowMissing: true,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'backend/coverage',
                                reportFiles: 'index.html',
                                reportName: 'Backend Coverage Report'
                            ])
                        }
                    }
                }
                stage('Frontend Tests') {
                    steps {
                        dir('frontend') {
                            sh 'npm test -- --coverage'
                        }
                    }
                    post {
                        always {
                            junit 'frontend/test-results.xml'
                            publishHTML(target: [
                                allowMissing: true,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'frontend/coverage',
                                reportFiles: 'index.html',
                                reportName: 'Frontend Coverage Report'
                            ])
                        }
                    }
                }
            }
        }

        stage('Security Scan') {
            parallel {
                stage('npm audit') {
                    steps {
                        dir('backend') {
                            sh 'npm audit --audit-level=high || true'
                        }
                        dir('frontend') {
                            sh 'npm audit --audit-level=high || true'
                        }
                    }
                }
                stage('OWASP Dependency Check') {
                    steps {
                        script {
                            try {
                                sh 'dependency-check --project "Lab Booking System" --scan backend/package-lock.json --scan frontend/package-lock.json --out dependency-check-report --format "ALL"'
                            } catch (err) {
                                echo 'OWASP Dependency Check completed with warnings'
                            }
                        }
                    }
                }
                stage('Trivy Container Scan') {
                    steps {
                        script {
                            try {
                                sh 'trivy fs --severity HIGH,CRITICAL . || true'
                            } catch (err) {
                                echo 'Trivy scan completed with warnings'
                            }
                        }
                    }
                }
            }
        }

        stage('SonarQube Analysis') {
            environment {
                SONAR_SCANNER_OPTS = "-Xmx2048m"
            }
            steps {
                script {
                    try {
                        withSonarQubeEnv('SonarQube') {
                            sh """
                                sonar-scanner \
                                -Dsonar.projectKey=lab-booking-system \
                                -Dsonar.projectName='Lab Booking System' \
                                -Dsonar.sources=backend/src,frontend/src \
                                -Dsonar.tests=backend/tests,frontend/src/__tests__ \
                                -Dsonar.javascript.lcov.reportPaths=backend/coverage/lcov.info,frontend/coverage/lcov.info \
                                -Dsonar.coverage.exclusions=**/node_modules/**,**/*.spec.ts,**/*.config.ts \
                                -Dsonar.sourceEncoding=UTF-8
                            """
                        }
                    } catch (err) {
                        echo 'SonarQube analysis skipped or failed - continuing pipeline'
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                script {
                    try {
                        timeout(time: 5, unit: 'MINUTES') {
                            waitForQualityGate abortPipeline: false
                        }
                    } catch (err) {
                        echo 'Quality gate check skipped'
                    }
                }
            }
        }

        stage('Docker Build & Push') {
            steps {
                script {
                    // Build backend image
                    sh "docker build -f backend/Dockerfile -t ${DOCKER_IMAGE_BACKEND} -t ${DOCKER_REGISTRY}/YOUR_USERNAME/lab-booking-backend:latest backend/"

                    // Build frontend image
                    sh "docker build -f frontend/Dockerfile -t ${DOCKER_IMAGE_FRONTEND} -t ${DOCKER_REGISTRY}/YOUR_USERNAME/lab-booking-frontend:latest frontend/"

                    // Push images to registry
                    withDockerRegistry([url: DOCKER_REGISTRY, credentialsId: 'docker-hub-credentials']) {
                        sh "docker push ${DOCKER_IMAGE_BACKEND}"
                        sh "docker push ${DOCKER_REGISTRY}/YOUR_USERNAME/lab-booking-backend:latest"
                        sh "docker push ${DOCKER_IMAGE_FRONTEND}"
                        sh "docker push ${DOCKER_REGISTRY}/YOUR_USERNAME/lab-booking-frontend:latest"
                    }
                }
            }
        }

        stage('Deploy to Staging') {
            environment {
                DEPLOY_ENV = 'staging'
            }
            steps {
                sh """
                    docker-compose -f docker-compose.staging.yml down || true
                    docker-compose -f docker-compose.staging.yml up -d --build
                    sleep 10
                """
            }
        }

        stage('Integration Tests') {
            steps {
                dir('backend') {
                    sh 'npm run test:integration || true'
                }
            }
            post {
                always {
                    junit 'backend/integration-test-results.xml'
                }
            }
        }

        stage('Manual Approval for Production') {
            steps {
                script {
                    try {
                        input(
                            message: 'Deploy to production?',
                            ok: 'Approve Deployment',
                            submitter: 'admin,production-team',
                            parameters: [
                                string(name: 'DEPLOY_NOTES', defaultValue: '', description: 'Deployment notes')
                            ]
                        )
                    } catch (err) {
                        echo 'Production deployment was not approved'
                        currentBuild.result = 'ABORTED'
                        error('Deployment not approved')
                    }
                }
            }
        }

        stage('Deploy to Production') {
            environment {
                DEPLOY_ENV = 'production'
            }
            steps {
                sh """
                    docker-compose -f docker-compose.prod.yml pull
                    docker-compose -f docker-compose.prod.yml up -d --no-deps --build
                    sleep 5
                    docker-compose -f docker-compose.prod.yml exec -T backend npm run db:migrate:prod
                """
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def maxRetries = 5
                    def retryCount = 0
                    while (retryCount < maxRetries) {
                        try {
                            sh 'curl -f http://localhost:3000/health || exit 1'
                            echo 'Health check passed'
                            break
                        } catch (err) {
                            retryCount++
                            echo "Health check attempt ${retryCount} failed, retrying..."
                            sleep 5
                        }
                    }
                    if (retryCount >= maxRetries) {
                        error('Health check failed after maximum retries')
                    }
                }
            }
        }
    }

    post {
        always {
            // Archive test results and coverage reports
            archiveArtifacts artifacts: '**/test-results.xml,**/coverage/**', allowEmptyArchive: true

            // Clean up workspace
            cleanWs()
        }

        success {
            emailext(
                to: 'team@telkom.ac.id',
                subject: "[SUCCESS] Lab Booking Pipeline - Build #${BUILD_NUMBER}",
                body: """
                    <h2>Lab Booking System - Build Successful</h2>
                    <p><strong>Build Number:</strong> #${BUILD_NUMBER}</p>
                    <p><strong>Git Commit:</strong> ${env.GIT_COMMIT_SHORT ?: 'N/A'}</p>
                    <p><strong>Branch:</strong> ${env.BRANCH_NAME ?: 'main'}</p>
                    <p><strong>Duration:</strong> ${currentBuild.durationString}</p>
                    <p><a href="${BUILD_URL}">View Build Details</a></p>
                """,
                mimeType: 'text/html'
            )
        }

        failure {
            emailext(
                to: 'team@telkom.ac.id',
                subject: "[FAILED] Lab Booking Pipeline - Build #${BUILD_NUMBER}",
                body: """
                    <h2>Lab Booking System - Build Failed</h2>
                    <p><strong>Build Number:</strong> #${BUILD_NUMBER}</p>
                    <p><strong>Git Commit:</strong> ${env.GIT_COMMIT_SHORT ?: 'N/A'}</p>
                    <p><strong>Failed Stage:</strong> ${currentBuild.result}</p>
                    <p><a href="${BUILD_URL}">Check logs for details</a></p>
                """,
                mimeType: 'text/html'
            )
        }

        unstable {
            emailext(
                to: 'team@telkom.ac.id',
                subject: "[UNSTABLE] Lab Booking Pipeline - Build #${BUILD_NUMBER}",
                body: 'Build is unstable. Check logs: ${BUILD_URL}',
                mimeType: 'text/html'
            )
        }
    }
}
