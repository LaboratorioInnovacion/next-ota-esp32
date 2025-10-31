'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Thermometer, Droplets, Clock, Activity } from 'lucide-react';
import { formatTimeAgo } from '@/lib/date-utils';

export function SensorData({ devices }) {
  const [sensorReadings, setSensorReadings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSensorReadings = async () => {
    try {
      const response = await fetch('/api/weather?limit=20');
      if (response.ok) {
        const data = await response.json();
        setSensorReadings(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching sensor readings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSensorReadings();
    
    // Actualizar cada 30 segundos
    const interval = setInterval(fetchSensorReadings, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Datos de Sensores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTemperatureColor = (temp) => {
    if (temp < 10) return 'text-blue-600';
    if (temp < 20) return 'text-green-600';
    if (temp < 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHumidityColor = (humidity) => {
    if (humidity < 30) return 'text-red-600';
    if (humidity < 70) return 'text-green-600';
    return 'text-blue-600';
  };

  const groupedReadings = sensorReadings.reduce((acc, reading) => {
    const deviceKey = reading.device.mac;
    if (!acc[deviceKey] || new Date(reading.timestamp) > new Date(acc[deviceKey].timestamp)) {
      acc[deviceKey] = reading;
    }
    return acc;
  }, {});

  const latestReadings = Object.values(groupedReadings);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Datos de Sensores en Tiempo Real
          </div>
          <Badge variant="outline" className="text-xs">
            {latestReadings.length} dispositivo(s)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {latestReadings.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No hay datos de sensores disponibles</p>
            <p className="text-sm text-gray-400 mt-2">
              Esperando datos de los dispositivos ESP32...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {latestReadings.map((reading) => (
              <div
                key={reading.device.mac}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {reading.device.name || `ESP32 ${reading.device.mac.slice(-8)}`}
                    </h4>
                    <p className="text-sm text-gray-500 font-mono">
                      {reading.device.mac}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={reading.device.status === 'ONLINE' ? 'default' : 'secondary'}
                      className="mb-1"
                    >
                      {reading.device.status}
                    </Badge>
                    <div className="flex items-center text-xs text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatTimeAgo(reading.timestamp)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Temperatura */}
                  {reading.data.temperature && (
                    <div className="flex items-center space-x-2">
                      <Thermometer className="h-4 w-4 text-red-500" />
                      <div>
                        <div className={`text-lg font-semibold ${getTemperatureColor(reading.data.temperature.value)}`}>
                          {reading.data.temperature.value.toFixed(1)}°C
                        </div>
                        <div className="text-xs text-gray-500">Temperatura</div>
                      </div>
                    </div>
                  )}

                  {/* Humedad */}
                  {reading.data.humidity && (
                    <div className="flex items-center space-x-2">
                      <Droplets className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className={`text-lg font-semibold ${getHumidityColor(reading.data.humidity.value)}`}>
                          {reading.data.humidity.value.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">Humedad</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Indicadores de estado */}
                <div className="mt-3 flex space-x-2">
                  {reading.data.temperature && (
                    <Badge variant="outline" className="text-xs">
                      {reading.data.temperature.value < 10 ? '🥶 Frío' : 
                       reading.data.temperature.value < 20 ? '😌 Fresco' :
                       reading.data.temperature.value < 30 ? '😊 Cálido' : '🥵 Caliente'}
                    </Badge>
                  )}
                  {reading.data.humidity && (
                    <Badge variant="outline" className="text-xs">
                      {reading.data.humidity.value < 30 ? '🏜️ Seco' :
                       reading.data.humidity.value < 70 ? '👌 Óptimo' : '💧 Húmedo'}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}