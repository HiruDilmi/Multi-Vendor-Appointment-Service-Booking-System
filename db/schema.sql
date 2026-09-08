-- Users (businesses, Clients, Admins)
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('customer', 'vendor', 'admin') DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Business profile
CREATE TABLE IF NOT EXISTS businesses (
  business_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  business_name VARCHAR(150) NOT NULL,
  bio TEXT,
  address VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Services offered by businesses
CREATE TABLE IF NOT EXISTS services (
  service_id INT AUTO_INCREMENT PRIMARY KEY,
  business_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- Business Availability in the Week
CREATE TABLE IF NOT EXISTS business_availability (
  availability_id INT AUTO_INCREMENT PRIMARY KEY,
  business_id INT NOT NULL,
  day_of_week TINYINT NOT NULL, -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  app_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  business_id INT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  decision_by INT NULL,
  FOREIGN KEY (customer_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE,
  FOREIGN KEY (decision_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Linking services to an appointment
CREATE TABLE IF NOT EXISTS appointment_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  app_id INT NOT NULL,
  service_id INT NOT NULL,
  price_at_booking DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (app_id) REFERENCES appointments(app_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE RESTRICT,
  UNIQUE KEY unique_appointment_service (app_id, service_id)
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);